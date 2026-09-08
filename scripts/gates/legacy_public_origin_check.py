#!/usr/bin/env python3
"""Reject retired production hostnames in active configuration and runbooks."""

from pathlib import Path

REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
FORBIDDEN_HOSTS = ("a4ai.tplinkdns.com", "a4ai.121-159-26-245.sslip.io")
ACTIVE_PATHS = (
    "backend/.env.example",
    "deploy/compose/.env.public-ice.example",
    "deploy/nginx/gcs-saker.acme-http.conf",
    "docs/operations/GCS-Saker_M7_external_nat_webrtc_validation.md",
    "docs/operations/GCS-Saker_외부노트북_스트림투입_가이드_v0.1.md",
    "gcs-dashboard/.env.example",
    "gcs-dashboard/README.md",
    "gcs-dashboard/vite.config.ts",
    "scripts/smoke/m7_external_nat_webrtc_smoke.sh",
    "scripts/smoke/m7_streaming_stability_soak.sh",
    "scripts/smoke/turn_relay_smoke.py",
    "scripts/smoke/webrtc_whip_publish_smoke.py",
    "services/auth-policy/src/main/resources/openapi/gcs-saker-operations.openapi.yaml",
)


def legacy_host_violations() -> list[str]:
    violations: list[str] = []
    for relative_path in ACTIVE_PATHS:
        source = (REPOSITORY_ROOT / relative_path).read_text(encoding="utf-8")
        for hostname in FORBIDDEN_HOSTS:
            if hostname in source:
                violations.append(f"{relative_path}: retired hostname {hostname}")
    return violations


def main() -> int:
    violations = legacy_host_violations()
    if violations:
        print("\n".join(violations))
        return 1
    print("Active public origin contract passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
