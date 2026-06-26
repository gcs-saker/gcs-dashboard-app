#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[1]
BACKEND_ROOT = REPO_ROOT / "backend"
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from modules.protocol_v2.gateway_service import (  # noqa: E402
    GatewayAckStatus,
    GatewayStreamRequest,
    GatewayStreamRequestPayload,
    GatewayStreamResponse,
)

PROTO_ROOT = REPO_ROOT / "contracts" / "proto"
GATEWAY_PROTO = PROTO_ROOT / "gcs" / "saker" / "v1" / "gateway_service.proto"
DESCRIPTOR_SET = REPO_ROOT / "tmp" / "gcs-saker-grpc-gateway.pb"
SCHEMA_VERSION = "grpc-runtime-smoke-v1"
DEFAULT_METHOD = "/gcs.saker.v1.SakerGatewayService/Exchange"
GATEWAY_TOKEN_METADATA = "x-gcs-gateway-token"
AUTHORIZATION_METADATA = "authorization"


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

    def grpc_tools_descriptor_command(self) -> list[str]:
        return [
            sys.executable,
            "-m",
            "grpc_tools.protoc",
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
    parser.add_argument("--messages", type=int, default=1, help="Number of GatewayStreamRequest messages to send on one bidi stream.")
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
        "status": "runtime-integrated",
        "descriptorCommand": config.descriptor_command(),
        "descriptorFallbackCommand": config.grpc_tools_descriptor_command(),
        "implementedRuntime": [
            "protobuf descriptor contract",
            "client implementation behind MessageSender abstraction",
            "CONTROL_GRPC_TARGET and CONTROL_GRPC_METHOD runtime configuration",
            "SakerGatewayService.Exchange server implementation in media-control",
            "metadata based gateway authorization",
            "explicit GatewayStreamRequest and GatewayStreamResponse DTO mappers",
            "multi-message bidi stream smoke",
            "malformed protobuf, backpressure, reconnect unit tests",
        ],
        "remainingBeforeFullActive": [
            "generated DTO adoption can replace explicit mappers when protoc plugins are pinned",
            "native/device gateway packaging outside smoke script",
            "long-lived multi-minute soak in staging network",
        ],
        "promotionGate": "Today scope is complete when Exchange succeeds over the compose internal network with explicit DTO mappers and multi-message bidi smoke.",
    }

    if args.check or not args.run:
        print(json.dumps(payload, ensure_ascii=False))
        return 0

    config.descriptor_set.parent.mkdir(parents=True, exist_ok=True)
    if not args.skip_descriptor:
        descriptor_result = compile_descriptor(config)
        if not descriptor_result["compiled"]:
            print(json.dumps({**payload, "descriptor": descriptor_result}, ensure_ascii=False))
            return int(descriptor_result["returnCode"])
        payload["descriptor"] = descriptor_result

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
        messages=max(args.messages, 1),
    )
    payload["runtime"] = runtime
    print(json.dumps(payload, ensure_ascii=False))
    return 0 if runtime["accepted"] else 1


def run_exchange_smoke(target: str, method: str, auth_token: str, timeout_seconds: float, messages: int) -> dict[str, Any]:
    try:
        import grpc
    except ImportError as exc:
        return {
            "executed": False,
            "accepted": False,
            "reason": f"grpcio is not installed: {exc}",
        }

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
        iter(gateway_request(index) for index in range(1, messages + 1)),
        metadata=metadata,
        timeout=timeout_seconds,
    )
    decoded_responses: list[GatewayStreamResponse] = []
    try:
        for response in responses:
            decoded_responses.append(GatewayStreamResponse.from_protobuf_wire(response))
    except Exception as exc:  # pragma: no cover - exact grpc exception varies by runtime
        return {
            "executed": True,
            "accepted": False,
            "reason": str(exc),
        }
    accepted = bool(decoded_responses) and all(item.status == GatewayAckStatus.ACCEPTED for item in decoded_responses)
    return {
        "executed": True,
        "accepted": accepted,
        "messageCount": messages,
        "responseCount": len(decoded_responses),
        "requestIds": [item.request_id for item in decoded_responses],
        "statuses": [int(item.status) for item in decoded_responses],
        "reasonCodes": [item.reason_code for item in decoded_responses],
    }


def compile_descriptor(config: GrpcRuntimeSmokeConfig) -> dict[str, Any]:
    attempts = [
        ("protoc", config.descriptor_command()),
        ("grpc_tools.protoc", config.grpc_tools_descriptor_command()),
    ]
    errors: list[dict[str, Any]] = []
    for name, command in attempts:
        try:
            result = subprocess.run(
                command,
                check=False,
                capture_output=True,
                text=True,
                cwd=REPO_ROOT,
            )
        except FileNotFoundError as exc:
            errors.append(
                {
                    "name": name,
                    "command": command,
                    "returnCode": 127,
                    "stderr": str(exc),
                }
            )
            continue
        if result.returncode == 0:
            return {
                "compiled": True,
                "compiler": name,
                "command": command,
                "returnCode": 0,
            }
        errors.append(
            {
                "name": name,
                "command": command,
                "returnCode": result.returncode,
                "stderr": result.stderr[:800],
            }
        )
    return {
        "compiled": False,
        "compiler": None,
        "command": [],
        "returnCode": errors[-1]["returnCode"] if errors else 1,
        "attempts": errors,
    }


def gateway_request(index: int) -> bytes:
    return GatewayStreamRequest(
        request_id=f"grpc-smoke-{index:03d}",
        org_id="a4ai",
        group_id="co-a",
        asset_id="raw.grpc.smoke",
        payload=GatewayStreamRequestPayload.telemetry(b"telemetry-smoke"),
    ).to_protobuf_wire()


def identity_bytes(payload: bytes) -> bytes:
    return payload


if __name__ == "__main__":
    raise SystemExit(main())
