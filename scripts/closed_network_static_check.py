#!/usr/bin/env python3
"""Static closed-network readiness checks for GCS-Saker.

This check intentionally avoids network access. It verifies that the active
runtime profile can be configured without public STUN, public map tiles, or
runtime npm install on the target appliance.
"""

from __future__ import annotations

from pathlib import Path
import sys


REPO_ROOT = Path(__file__).resolve().parents[1]
PUBLIC_GOOGLE_STUN = "stun:stun.l.google.com:19302"
LOCAL_STUN = "stun:localhost:3478"

ACTIVE_CONFIG_FILES = (
    REPO_ROOT / "backend" / "config.py",
    REPO_ROOT / "backend" / ".env.example",
    REPO_ROOT / "gcs-dashboard" / ".env.example",
    REPO_ROOT / "gcs-dashboard" / ".env.production.example",
    REPO_ROOT / "gcs-dashboard" / ".env.staging.example",
    REPO_ROOT / "gcs-dashboard" / ".env.closed-network.example",
    REPO_ROOT / "gcs-dashboard" / "docker-compose.yml",
    REPO_ROOT / "gcs-dashboard" / "docker-compose.ice.example.yml",
    REPO_ROOT / "gcs-dashboard" / "Dockerfile",
    REPO_ROOT / "gcs-dashboard" / "mediamtx.yml",
    REPO_ROOT / "scripts" / "streaming_e2e_smoke.sh",
    REPO_ROOT / "scripts" / "webrtc_ice_smoke.py",
)

OFFLINE_MAP_FILES = (
    REPO_ROOT / "gcs-dashboard" / "src" / "features" / "dashboard" / "map" / "TacticalLeafletMap.tsx",
)

DASHBOARD_DOCKERFILE = REPO_ROOT / "gcs-dashboard" / "Dockerfile"
CLOSED_NETWORK_ENV = REPO_ROOT / "gcs-dashboard" / ".env.closed-network.example"


def main() -> int:
    errors: list[str] = []
    errors.extend(check_public_stun_removed())
    errors.extend(check_closed_network_env())
    errors.extend(check_offline_map())
    errors.extend(check_dashboard_serves_built_artifacts())

    if errors:
        for error in errors:
            print(f"closed-network check failed: {error}", file=sys.stderr)
        return 1

    print("Closed-network static check passed")
    return 0


def check_public_stun_removed() -> list[str]:
    errors: list[str] = []
    for path in ACTIVE_CONFIG_FILES:
        content = path.read_text(encoding="utf-8")
        if PUBLIC_GOOGLE_STUN in content:
            errors.append(f"{path.relative_to(REPO_ROOT)} still defaults to public Google STUN")
    return errors


def check_closed_network_env() -> list[str]:
    content = CLOSED_NETWORK_ENV.read_text(encoding="utf-8")
    required_values = (
        "VITE_STREAM_API_BASE_URL=/media-control",
        "WEBRTC_STUN_URL=stun:10.0.0.10:3478",
        "WEBRTC_TURN_URL=turn:10.0.0.10:3478?transport=udp",
        "TIME_SYNC_MODE=closed_network",
        "TIME_SYNC_SOURCE_HOST=10.0.0.10",
        "MEDIA_CONTROL_STUN_URL=stun:10.0.0.10:3478",
    )
    return [
        f".env.closed-network.example missing {value}"
        for value in required_values
        if value not in content
    ]


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
        "RUN npm run build",
        "FROM nginx:alpine",
        "COPY --from=builder /app/dist /usr/share/nginx/html",
    )
    errors = [f"Dashboard Dockerfile missing {token}" for token in required_tokens if token not in content]
    if LOCAL_STUN not in content:
        errors.append("Dashboard Dockerfile must default VITE_WEBRTC_STUN_URL to local STUN")
    return errors


if __name__ == "__main__":
    raise SystemExit(main())
