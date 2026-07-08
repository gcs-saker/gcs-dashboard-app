from __future__ import annotations

from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
ENDPOINT_CATALOGUE = REPO_ROOT / "docs/architecture/GCS-Saker_M10_endpoint_catalogue.md"
FRONTEND_SRC = REPO_ROOT / "gcs-dashboard/src"
NGINX_EXAMPLE = REPO_ROOT / "deploy/nginx/gcs-saker.reverse-proxy.example.conf"
PYTHON_CONTRACTS = REPO_ROOT / "backend/api/contracts.py"
MEDIA_CONTROL_README = REPO_ROOT / "services/media-control/README.md"


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def frontend_source_text() -> str:
    return "\n".join(
        path.read_text(encoding="utf-8")
        for path in FRONTEND_SRC.rglob("*")
        if path.suffix in {".ts", ".tsx"} and "node_modules" not in path.parts
    )


def test_endpoint_catalogue_covers_public_entrypoint_and_routes() -> None:
    catalogue = read_text(ENDPOINT_CATALOGUE)

    required_routes = [
        "Nginx 443",
        "/auth-policy/auth/login",
        "/auth-policy/auth/refresh",
        "/api/ops/events/stream",
        "/api/ops/server-health/snapshots",
        "/media-control/api/v1/streams",
        "/media-control/api/v1/streams/ice-servers",
        "/media-control/api/v1/streams/{streamId}/playback",
        "/media-control/api/v1/streams/{streamId}/publish",
        "/auth-policy/policy/devices/publish",
        "/webrtc/{streamPath}/whip",
        "/webrtc/{streamPath}/whep",
        "/hls/{streamPath}/index.m3u8",
        "/api/v1/map/config",
    ]

    for route in required_routes:
        assert route in catalogue


def test_endpoint_catalogue_documents_required_data_and_headers() -> None:
    catalogue = read_text(ENDPOINT_CATALOGUE)

    required_contracts = [
        "Authorization",
        "Bearer <accessToken>",
        "X-GCS-CSRF",
        "traceparent",
        "username",
        "password",
        "orgId",
        "groupId",
        "assetId",
        "requestId",
        "iceServers[]",
        "playbackUrls.webrtc",
        "playbackUrls.hls",
        "whipUrl",
        "deviceUuid",
        "X-GCS-Device-UUID",
        "X-GCS-Device-Credential",
        "publisherGroupId",
    ]

    for contract in required_contracts:
        assert contract in catalogue


def test_endpoint_catalogue_documents_protocol_boundaries() -> None:
    catalogue = read_text(ENDPOINT_CATALOGUE)

    required_boundaries = [
        "브라우저는 gRPC에 직접 연결하지 않는다",
        "Media frame은 WebRTC/HLS media plane으로만 보낸다",
        "gcs.saker.v1.SakerGatewayService",
        "/gcs.saker.v1.SakerGatewayService/Exchange",
        "gcs/{orgId}/{groupId}/{assetId}/telemetry",
        "gcs/+/+/+/telemetry",
        "legacy/fallback",
        "미인가 로봇/드론",
    ]

    for boundary in required_boundaries:
        assert boundary in catalogue


def test_frontend_keeps_browser_protocol_boundary() -> None:
    source = frontend_source_text()

    forbidden_browser_terms = [
        "SakerGatewayService",
        "x-gcs-gateway-token",
        "MEDIA_CONTROL_GRPC_TOKEN",
        "CONTROL_GRPC_TARGET",
        "MQTT_PASSWORD",
        "mqtt://",
        "grpc://",
    ]

    for term in forbidden_browser_terms:
        assert term not in source


def test_reverse_proxy_and_legacy_contracts_match_endpoint_catalogue() -> None:
    catalogue = read_text(ENDPOINT_CATALOGUE)
    nginx = read_text(NGINX_EXAMPLE)
    python_contracts = read_text(PYTHON_CONTRACTS)
    media_control_readme = read_text(MEDIA_CONTROL_README)

    for nginx_route in [
        "location /auth-policy/",
        "location /media-control/",
        "location /hls/",
        "location /webrtc/",
        "location = /api/v1/map/config",
    ]:
        assert nginx_route in nginx

    assert '"/auth-policy/auth"' in python_contracts
    assert '"/media-control/api/v1/streams"' in python_contracts
    assert "Browser dashboard도 gRPC에 직접 연결하지 않고" in media_control_readme
    assert "/auth-policy/auth" in catalogue
    assert "/media-control/api/v1/streams" in catalogue
