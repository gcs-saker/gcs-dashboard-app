#!/usr/bin/env python3
"""Static closed-network readiness checks for GCS-Saker.

This check intentionally avoids network access. It verifies that the active
runtime profile can be configured without public STUN, public map tiles, or
runtime npm install on the target appliance.
"""

from __future__ import annotations

from pathlib import Path
import sys


REPO_ROOT = Path(__file__).resolve().parents[2]
OFFLINE_MAP_FILES = (
    REPO_ROOT / "gcs-dashboard" / "src" / "features" / "dashboard" / "map" / "TacticalLeafletMap.tsx",
)

DASHBOARD_DOCKERFILE = REPO_ROOT / "gcs-dashboard" / "Dockerfile"
CLOSED_NETWORK_ENV = REPO_ROOT / "gcs-dashboard" / ".env.closed-network.example"
DEPLOY_CLOSED_NETWORK_ENV = REPO_ROOT / "deploy" / "compose" / ".env.closed-network.example"
DEPLOY_PUBLIC_ICE_ENV = REPO_ROOT / "deploy" / "compose" / ".env.public-ice.example"
DEPLOY_MIXED_NETWORK_ENV = REPO_ROOT / "deploy" / "compose" / ".env.mixed-network.example"
RUNBOOK = REPO_ROOT / "docs" / "operations" / "GCS-Saker_Closed_Network_Profile_Runbook_v0.1.md"


def main() -> int:
    errors: list[str] = []
    errors.extend(check_closed_network_env())
    errors.extend(check_network_profile_split())
    errors.extend(check_offline_map())
    errors.extend(check_dashboard_serves_built_artifacts())
    errors.extend(check_offline_artifact_runbook())

    if errors:
        for error in errors:
            print(f"closed-network check failed: {error}", file=sys.stderr)
        return 1

    print("Closed-network static check passed")
    return 0


def check_closed_network_env() -> list[str]:
    content = CLOSED_NETWORK_ENV.read_text(encoding="utf-8")
    deploy_content = DEPLOY_CLOSED_NETWORK_ENV.read_text(encoding="utf-8")
    required_values = (
        "VITE_STREAM_API_BASE_URL=/media-control",
        "VITE_MAP_PROVIDER=offline",
        "DASHBOARD_MAP_PROVIDER=offline",
        "WEBRTC_STUN_URL=stun:10.0.0.10:3478",
        "WEBRTC_TURN_URL=turn:10.0.0.10:3478?transport=udp",
        "TIME_SYNC_MODE=closed_network",
        "TIME_SYNC_SOURCE_HOST=10.0.0.10",
        "MEDIA_CONTROL_STUN_URL=stun:10.0.0.10:3478",
        "DATABASE_URL=postgresql+psycopg2://gcs_geo:replace-with-secret-outside-git@postgres-geo:5432/gcs_geo",
    )
    errors = [
        f".env.closed-network.example missing {value}"
        for value in required_values
        if value not in content
    ]
    deploy_required_values = (
        "SAKER_NETWORK_PROFILE=closed",
        "VITE_STATIC_ASSET_DELIVERY_MODE=offline-bundle",
        "VITE_MAP_STYLE_URL=offline://tactical-map",
        "TURN_EXTERNAL_IP=10.0.0.10",
        "MEDIA_CONTROL_TURN_SECONDARY_URL=turn:10.0.0.11:3478?transport=udp",
        "AUTH_REFRESH_COOKIE_SECURE=true",
        "AUTH_REFRESH_COOKIE_SAMESITE=strict",
    )
    errors.extend(
        f"deploy closed-network env missing {value}"
        for value in deploy_required_values
        if value not in deploy_content
    )
    forbidden_values = (
        "stun:stun.l.google.com:19302",
        "services.arcgisonline.com",
        "tile.openstreetmap.org",
        "googleapis",
    )
    errors.extend(
        f"deploy closed-network env contains public dependency {value}"
        for value in forbidden_values
        if value in deploy_content
    )
    return errors


def check_network_profile_split() -> list[str]:
    public_content = DEPLOY_PUBLIC_ICE_ENV.read_text(encoding="utf-8")
    mixed_content = DEPLOY_MIXED_NETWORK_ENV.read_text(encoding="utf-8")
    errors: list[str] = []
    required_public_values = (
        "MEDIA_CONTROL_STUN_URL=stun:a4ai.tplinkdns.com:3478",
        "MEDIA_CONTROL_TURN_MAX_HEALTHY_SERVERS=1",
    )
    errors.extend(
        f"public ICE env missing {value}"
        for value in required_public_values
        if value not in public_content
    )
    required_mixed_values = (
        "SAKER_NETWORK_PROFILE=mixed",
        "VITE_STATIC_ASSET_DELIVERY_MODE=internal-cdn",
        "MEDIA_CONTROL_STUN_URL=stun:10.0.0.10:3478",
        "TIME_SYNC_MODE=public",
    )
    errors.extend(
        f"mixed-network env missing {value}"
        for value in required_mixed_values
        if value not in mixed_content
    )
    return errors


def check_offline_map() -> list[str]:
    forbidden_tokens = ("TileLayer", "openstreetmap", "tile.openstreetmap.org", "mapbox", "googleapis")
    errors: list[str] = []
    for path in OFFLINE_MAP_FILES:
        content = path.read_text(encoding="utf-8").lower()
        for token in forbidden_tokens:
            if token.lower() in content:
                errors.append(f"{path.relative_to(REPO_ROOT)} contains external map token {token}")
    return errors


def check_dashboard_serves_built_artifacts() -> list[str]:
    content = DASHBOARD_DOCKERFILE.read_text(encoding="utf-8")
    required_tokens = (
        "npm run build",
        "FROM nginx:alpine",
        "COPY --from=builder /app/dist /usr/share/nginx/html",
    )
    errors = [f"Dashboard Dockerfile missing {token}" for token in required_tokens if token not in content]
    return errors


def check_offline_artifact_runbook() -> list[str]:
    content = RUNBOOK.read_text(encoding="utf-8")
    required_tokens = (
        "docker load -i gcs-saker-images-<version>.tar",
        "images.manifest.txt",
        "SHA256SUMS",
        "npm ci --offline",
        "pip install --no-index --find-links wheelhouse",
        "./gradlew --offline check",
        "GOPROXY=off go test ./...",
        "Docker Engine offline install package",
        "internal CA",
        "rollback",
    )
    return [
        f"closed-network runbook missing offline artifact token {token}"
        for token in required_tokens
        if token not in content
    ]


if __name__ == "__main__":
    raise SystemExit(main())
