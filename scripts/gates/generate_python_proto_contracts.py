#!/usr/bin/env python3
"""Generate Python protobuf bindings from contracts/proto without hand-copied field numbers."""

from pathlib import Path

from grpc_tools import protoc

REPO_ROOT = Path(__file__).resolve().parents[2]
PROTO_ROOT = REPO_ROOT / "contracts" / "proto"
OUTPUT_ROOT = REPO_ROOT / "backend"
PROTO_FILES = (
    "gcs/saker/v1/common.proto",
    "gcs/saker/v1/stream_control.proto",
    "gcs/saker/v1/telemetry.proto",
    "gcs/saker/v1/gateway_service.proto",
)


def main() -> int:
    return protoc.main(
        [
            "protoc",
            f"-I{PROTO_ROOT}",
            f"--python_out={OUTPUT_ROOT}",
            *[str(PROTO_ROOT / source) for source in PROTO_FILES],
        ]
    )


if __name__ == "__main__":
    raise SystemExit(main())
