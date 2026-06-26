#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[1]
PROTO_ROOT = REPO_ROOT / "contracts" / "proto"
GATEWAY_PROTO = PROTO_ROOT / "gcs" / "saker" / "v1" / "gateway_service.proto"
DESCRIPTOR_SET = REPO_ROOT / "tmp" / "gcs-saker-grpc-gateway.pb"
SCHEMA_VERSION = "grpc-runtime-smoke-v1"
DEFAULT_METHOD = "/gcs.saker.v1.SakerGatewayService/Exchange"
GATEWAY_TOKEN_METADATA = "x-gcs-gateway-token"
AUTHORIZATION_METADATA = "authorization"
ACCEPTED_STATUS = 1
RESPONSE_FIELD_REQUEST_ID = 2
RESPONSE_FIELD_STATUS = 3
RESPONSE_FIELD_REASON_CODE = 4


@dataclass(frozen=True)
class GrpcRuntimeSmokeConfig:
    proto_root: Path
    gateway_proto: Path
    descriptor_set: Path

    def descriptor_command(self) -> list[str]:
        return [
            "protoc",
            f"--proto_path={self.proto_root}",
            f"--descriptor_set_out={self.descriptor_set}",
            "--include_imports",
            str(self.gateway_proto.relative_to(self.proto_root)),
        ]


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Validate the gRPC gateway contract and expose missing runtime gates.")
    parser.add_argument("--check", action="store_true", help="Print the stable smoke contract without executing protoc.")
    parser.add_argument("--run", action="store_true", help="Compile the gateway descriptor contract.")
    parser.add_argument("--skip-descriptor", action="store_true", help="Skip protoc descriptor compilation for container-only runtime smoke.")
    parser.add_argument("--proto-root", type=Path, default=PROTO_ROOT)
    parser.add_argument("--gateway-proto", type=Path, default=GATEWAY_PROTO)
    parser.add_argument("--descriptor-set", type=Path, default=DESCRIPTOR_SET)
    parser.add_argument("--target", default=os.getenv("CONTROL_GRPC_TARGET", ""))
    parser.add_argument("--auth-token", default=os.getenv("CONTROL_GRPC_AUTH_TOKEN", ""))
    parser.add_argument("--method", default=os.getenv("CONTROL_GRPC_METHOD", DEFAULT_METHOD))
    parser.add_argument("--timeout-seconds", type=float, default=2.0)
    return parser


def main() -> int:
    args = build_parser().parse_args()
    config = GrpcRuntimeSmokeConfig(
        proto_root=args.proto_root,
        gateway_proto=args.gateway_proto,
        descriptor_set=args.descriptor_set,
    )

    payload: dict[str, Any] = {
        "schemaVersion": SCHEMA_VERSION,
        "status": "runtime-partial",
        "descriptorCommand": config.descriptor_command(),
        "implementedRuntime": [
            "protobuf descriptor contract",
            "client implementation behind MessageSender abstraction",
            "CONTROL_GRPC_TARGET and CONTROL_GRPC_METHOD runtime configuration",
            "SakerGatewayService.Exchange server implementation in media-control",
            "metadata based gateway authorization",
            "malformed protobuf, backpressure, reconnect unit tests",
        ],
        "remainingBeforeFullActive": [
            "generated DTO or explicit mapper adoption across Kotlin Go Python",
            "native/device gateway runtime client",
            "long-lived bidi stream backpressure soak",
        ],
        "promotionGate": "gRPC becomes active when Exchange succeeds over the compose internal network and the native/device gateway path uses generated or explicit DTO mappers.",
    }

    if args.check or not args.run:
        print(json.dumps(payload, ensure_ascii=False))
        return 0

    config.descriptor_set.parent.mkdir(parents=True, exist_ok=True)
    if not args.skip_descriptor:
        descriptor_result = subprocess.run(
            config.descriptor_command(),
            check=False,
            capture_output=False,
            text=True,
            cwd=REPO_ROOT,
        )
        if descriptor_result.returncode != 0:
            return descriptor_result.returncode

    target = args.target.strip()
    auth_token = args.auth_token.strip()
    if not target or not auth_token:
        payload["runtime"] = {
            "executed": False,
            "reason": "CONTROL_GRPC_TARGET or CONTROL_GRPC_AUTH_TOKEN is not configured",
        }
        print(json.dumps(payload, ensure_ascii=False))
        return 0

    runtime = run_exchange_smoke(
        target=target,
        method=args.method.strip() or DEFAULT_METHOD,
        auth_token=auth_token,
        timeout_seconds=args.timeout_seconds,
    )
    payload["runtime"] = runtime
    print(json.dumps(payload, ensure_ascii=False))
    return 0 if runtime["accepted"] else 1


def run_exchange_smoke(target: str, method: str, auth_token: str, timeout_seconds: float) -> dict[str, Any]:
    try:
        import grpc
    except ImportError as exc:
        return {
            "executed": False,
            "accepted": False,
            "reason": f"grpcio is not installed: {exc}",
        }

    request_id = "grpc-smoke-001"
    channel = grpc.insecure_channel(target)
    stub = channel.stream_stream(
        method,
        request_serializer=identity_bytes,
        response_deserializer=identity_bytes,
    )
    metadata = (
        (AUTHORIZATION_METADATA, f"Bearer {auth_token}"),
        (GATEWAY_TOKEN_METADATA, auth_token),
    )
    responses = stub(
        iter([gateway_request(request_id)]),
        metadata=metadata,
        timeout=timeout_seconds,
    )
    try:
        response = next(iter(responses))
    except Exception as exc:  # pragma: no cover - exact grpc exception varies by runtime
        return {
            "executed": True,
            "accepted": False,
            "reason": str(exc),
        }
    decoded = decode_response(response)
    return {
        "executed": True,
        "accepted": decoded.get(RESPONSE_FIELD_STATUS) == ACCEPTED_STATUS,
        "requestId": decoded.get(RESPONSE_FIELD_REQUEST_ID),
        "status": decoded.get(RESPONSE_FIELD_STATUS),
        "reasonCode": decoded.get(RESPONSE_FIELD_REASON_CODE),
    }


def gateway_request(request_id: str) -> bytes:
    payload = bytearray()
    encode_string(payload, 1, request_id)
    encode_string(payload, 2, "a4ai")
    encode_string(payload, 3, "co-a")
    encode_string(payload, 4, "raw.grpc.smoke")
    encode_bytes(payload, 10, b"telemetry-smoke")
    return bytes(payload)


def decode_response(payload: bytes) -> dict[int, Any]:
    cursor = 0
    decoded: dict[int, Any] = {}
    while cursor < len(payload):
        key, cursor = decode_varint(payload, cursor)
        field_number = key >> 3
        wire_type = key & 0b111
        if wire_type == 0:
            decoded[field_number], cursor = decode_varint(payload, cursor)
        elif wire_type == 2:
            length, cursor = decode_varint(payload, cursor)
            raw = payload[cursor : cursor + length]
            decoded[field_number] = raw.decode("utf-8")
            cursor += length
        else:
            raise ValueError(f"unsupported response wire type: {wire_type}")
    return decoded


def encode_string(payload: bytearray, field_number: int, value: str) -> None:
    encode_bytes(payload, field_number, value.encode("utf-8"))


def encode_bytes(payload: bytearray, field_number: int, value: bytes) -> None:
    encode_varint(payload, (field_number << 3) | 2)
    encode_varint(payload, len(value))
    payload.extend(value)


def encode_varint(payload: bytearray, value: int) -> None:
    while value > 0x7F:
        payload.append((value & 0x7F) | 0x80)
        value >>= 7
    payload.append(value)


def decode_varint(payload: bytes, cursor: int) -> tuple[int, int]:
    shift = 0
    result = 0
    while cursor < len(payload):
        current = payload[cursor]
        cursor += 1
        result |= (current & 0x7F) << shift
        if current & 0x80 == 0:
            return result, cursor
        shift += 7
    raise ValueError("unterminated varint")


def identity_bytes(payload: bytes) -> bytes:
    return payload


if __name__ == "__main__":
    raise SystemExit(main())
