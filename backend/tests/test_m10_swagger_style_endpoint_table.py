from __future__ import annotations

from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
SWAGGER_STYLE_TABLE = REPO_ROOT / "docs/api/GCS-Saker_API_Swagger_Style_Table.md"


def read_table() -> str:
    return SWAGGER_STYLE_TABLE.read_text(encoding="utf-8")


def test_swagger_style_table_uses_requested_table_shape() -> None:
    table = read_table()

    required_columns = [
        "| Method | Path | Auth | Headers | Params | Body | Response | Notes |",
        "| Protocol | Address / Topic | Auth | Required Data | Response / Ack | Notes |",
    ]

    for columns in required_columns:
        assert columns in table


def test_swagger_style_table_covers_core_public_endpoints() -> None:
    table = read_table()

    required_paths = [
        "/auth-policy/auth/login",
        "/auth-policy/auth/signup",
        "/auth-policy/auth/refresh",
        "/auth-policy/auth/me",
        "/api/ops/events",
        "/api/ops/events/stream",
        "/api/ops/server-health/snapshots",
        "/api/ops/time/status",
        "/api/telemetry/",
        "/media-control/api/v1/streams",
        "/media-control/api/v1/streams/ice-servers",
        "/media-control/api/v1/streams/{streamId}/playback",
        "/media-control/api/v1/streams/{streamId}/publish",
        "/webrtc/{streamPath}/whip",
        "/webrtc/{streamPath}/whep",
        "/hls/{streamPath}/index.m3u8",
    ]

    for path in required_paths:
        assert path in table


def test_swagger_style_table_documents_non_http_device_boundaries() -> None:
    table = read_table()

    required_boundaries = [
        "/gcs.saker.v1.SakerGatewayService/Exchange",
        "x-gcs-gateway-token",
        "gcs/{orgId}/{groupId}/{assetId}/telemetry",
        "gcs/{orgId}/{groupId}/{assetId}/command_ack",
        "browser 직접 연결 금지",
        "media frame은 WebRTC/HLS media plane으로만 보낸다",
    ]

    for boundary in required_boundaries:
        assert boundary in table


def test_swagger_style_table_does_not_introduce_openapi_runtime() -> None:
    table = read_table().lower()

    forbidden_runtime_terms = [
        "swaggerapi/swagger-ui",
        "openapi: 3",
        "docker run",
        "swagger ui 실행",
    ]

    for term in forbidden_runtime_terms:
        assert term not in table
