#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import subprocess
from dataclasses import dataclass
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
PROTO_ROOT = REPO_ROOT / "contracts" / "proto"
GATEWAY_PROTO = PROTO_ROOT / "gcs" / "saker" / "v1" / "gateway_service.proto"
DESCRIPTOR_SET = REPO_ROOT / "tmp" / "gcs-saker-grpc-gateway.pb"
SCHEMA_VERSION = "grpc-runtime-smoke-v1"


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
    parser.add_argument("--proto-root", type=Path, default=PROTO_ROOT)
    parser.add_argument("--gateway-proto", type=Path, default=GATEWAY_PROTO)
    parser.add_argument("--descriptor-set", type=Path, default=DESCRIPTOR_SET)
    return parser


def main() -> int:
    args = build_parser().parse_args()
    config = GrpcRuntimeSmokeConfig(
        proto_root=args.proto_root,
        gateway_proto=args.gateway_proto,
        descriptor_set=args.descriptor_set,
    )

    payload = {
        "schemaVersion": SCHEMA_VERSION,
        "status": "contract",
        "descriptorCommand": config.descriptor_command(),
        "requiredBeforeActive": [
            "Spring/Kotlin or Go gRPC runtime dependency",
            "SakerGatewayService.Exchange server implementation",
            "client implementation behind MessageSender abstraction",
            "internal compose port and network policy",
            "bidirectional streaming runtime smoke",
        ],
        "promotionGate": "gRPC remains contract-only until Exchange stream succeeds over a real internal network path.",
    }

    if args.check or not args.run:
        print(json.dumps(payload, ensure_ascii=False))
        return 0

    config.descriptor_set.parent.mkdir(parents=True, exist_ok=True)
    result = subprocess.run(
        config.descriptor_command(),
        check=False,
        capture_output=False,
        text=True,
        cwd=REPO_ROOT,
    )
    return result.returncode


if __name__ == "__main__":
    raise SystemExit(main())
