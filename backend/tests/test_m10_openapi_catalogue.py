from __future__ import annotations

import json
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
OPENAPI_SPEC = REPO_ROOT / "docs/api/openapi/gcs-saker-public-api.openapi.json"
SWAGGER_GUIDE = REPO_ROOT / "docs/api/GCS-Saker_Swagger_UI_Guide.md"


def load_spec() -> dict:
    return json.loads(OPENAPI_SPEC.read_text(encoding="utf-8"))


def test_openapi_spec_is_valid_json_and_has_core_metadata() -> None:
    spec = load_spec()

    assert spec["openapi"] == "3.1.0"
    assert spec["info"]["title"] == "GCS-Saker Public Edge API"
    assert spec["servers"][0]["url"] == "https://a4ai.tplinkdns.com"
    assert "x-gcs-protocol-boundary" in spec


def test_openapi_spec_covers_required_public_paths() -> None:
    paths = load_spec()["paths"]

    required_paths = [
        "/auth-policy/auth/login",
        "/auth-policy/auth/signup",
        "/auth-policy/auth/refresh",
        "/auth-policy/auth/me",
        "/api/ops/events",
        "/api/ops/events/stream",
        "/api/ops/server-health/snapshots",
        "/api/ops/time/status",
        "/media-control/api/v1/streams",
        "/media-control/api/v1/streams/ice-servers",
        "/media-control/api/v1/streams/{streamId}/playback",
        "/media-control/api/v1/streams/{streamId}/publish",
        "/webrtc/{streamPath}/whip",
        "/webrtc/{streamPath}/whep",
        "/hls/{streamPath}/index.m3u8",
        "/stream/status",
        "/api/v1/map/config",
    ]

    for path in required_paths:
        assert path in paths


def test_openapi_spec_documents_security_and_protocol_boundary() -> None:
    spec = load_spec()
    schemes = spec["components"]["securitySchemes"]
    boundary = spec["x-gcs-protocol-boundary"]

    assert "bearerAuth" in schemes
    assert schemes["csrfHeader"]["name"] == "X-GCS-CSRF"
    assert "gRPC direct" in boundary["browserForbidden"]
    assert "MQTT direct" in boundary["browserForbidden"]
    assert boundary["internalGateway"]["grpcMethod"] == "/gcs.saker.v1.SakerGatewayService/Exchange"
    assert "gcs/{orgId}/{groupId}/{assetId}/telemetry" in boundary["mqttTopics"]


def test_openapi_spec_does_not_contain_real_secrets() -> None:
    serialized = OPENAPI_SPEC.read_text(encoding="utf-8").lower()

    forbidden_fragments = [
        "#2258703325",
        "replace-with-secret",
        "actual-password",
        "actual-token",
        "private key",
    ]

    for fragment in forbidden_fragments:
        assert fragment not in serialized


def test_swagger_guide_points_to_openapi_spec() -> None:
    guide = SWAGGER_GUIDE.read_text(encoding="utf-8")

    assert "docs/api/openapi/gcs-saker-public-api.openapi.json" in guide
    assert "swaggerapi/swagger-ui" in guide
    assert "docker load" in guide
