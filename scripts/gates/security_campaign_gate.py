#!/usr/bin/env python3
"""Require bounded REST, gRPC, protobuf, and MQTT security campaigns."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

REQUIRED_EVIDENCE = {
    "rest-dast": (
        ROOT / "scripts/smoke/auth_boundary_dast.py",
        ("playback_idor_unauthenticated", "login_oversized", "FORBIDDEN_RESPONSE_MARKERS"),
    ),
    "grpc-boundary": (
        ROOT / "services/media-control/internal/grpcgateway/server_test.go",
        ("reasonMalformed", "reasonBackpressure", "reasonIdentityMismatch"),
    ),
    "grpc-fuzz": (
        ROOT / "services/media-control/internal/grpcgateway/auth_fuzz_test.go",
        ("FuzzGatewayMetadata",),
    ),
    "mqtt-boundary": (
        ROOT / "services/media-control/internal/mqttgateway/message_test.go",
        ("MalformedAndOversized", "gcs/device/+/telemetry", "invalid payload reached gateway"),
    ),
    "mqtt-fuzz": (
        ROOT / "services/media-control/internal/mqttgateway/message_fuzz_test.go",
        ("FuzzSessionFromTopic",),
    ),
    "token-fuzz": (
        ROOT / "services/media-control/internal/sessiontoken/token_fuzz_test.go",
        ("FuzzValidateForRoute",),
    ),
}


def verify_campaigns() -> dict[str, str]:
    results: dict[str, str] = {}
    for name, (path, markers) in REQUIRED_EVIDENCE.items():
        if not path.is_file():
            raise ValueError(f"security campaign source is missing: {name}")
        source = path.read_text(encoding="utf-8")
        if any(marker not in source for marker in markers):
            raise ValueError(f"security campaign evidence is incomplete: {name}")
        results[name] = "PASS"
    return results


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    if not args.check:
        raise SystemExit("--check is required")
    campaigns = verify_campaigns()
    print(json.dumps({"schemaVersion": "gcs-saker.security-campaign.v1", "campaigns": campaigns}, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
