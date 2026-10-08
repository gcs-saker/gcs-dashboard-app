#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
EVIDENCE = (
    "mqtt-positive-negative-e2e-2026-10-08.md",
    "mqtt-legacy-removal-2026-10-08.md",
    "control-single-path-2026-10-08.md",
    "backend-media-grpc-mtls-2026-10-08.md",
    "auth-policy-grpc-only-2026-10-08.md",
    "postgres-redis-tls-2026-10-08.md",
    "mediamtx-management-protection-2026-10-08.md",
    "turn-tls-ephemeral-credentials-2026-10-08.md",
    "stream-session-sse-signal-2026-10-08.md",
    "redis-session-statistics-2026-10-08.md",
)


def qualification() -> dict[str, object]:
    evidence_root = ROOT / "docs" / "compliance" / "evidence"
    missing = [name for name in EVIDENCE if not (evidence_root / name).is_file()]
    return {
        "schemaVersion": "gcs-saker.final-e2e-qualification.v1",
        "localDocker": "PASS" if not missing else "FAIL",
        "server01": "NOT_RUN",
        "physicalEquipment": "BLOCKED",
        "virtualDeviceCounts": [10, 50, 100],
        "requiredBoundaries": [
            "mqtt-mtls",
            "media-control",
            "grpc-mtls",
            "auth-policy",
            "postgres-redis-tls",
            "frontend-rest-sse-webrtc",
        ],
        "negativeControls": [
            "anonymous-mqtt",
            "revoked-certificate",
            "cross-group",
            "forged-expired-token",
            "plaintext-private-transport",
            "invalid-server-name",
        ],
        "missingEvidence": missing,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", required=True)
    parser.parse_args()
    payload = qualification()
    print(json.dumps(payload, ensure_ascii=False, indent=2))
    return 0 if payload["localDocker"] == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
