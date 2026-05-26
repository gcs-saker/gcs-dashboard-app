from dataclasses import dataclass

from fastapi.testclient import TestClient

from api.health import get_database_probe
from api.stream import get_v1_streaming_service
from main import app
from modules.streaming import PlaybackUrlBuilder, PlaybackUrlBuilderConfig, StreamingService


@dataclass(frozen=True)
class FakeStreamingModuleStatus:
    registry_ready: bool
    playback_url_builder_ready: bool
    registered_streams: int = 0


class BrokenStreamingService:
    def module_status(self) -> FakeStreamingModuleStatus:
        return FakeStreamingModuleStatus(
            registry_ready=False,
            playback_url_builder_ready=False,
        )


def ready_database_probe() -> bool:
    return True


def failing_database_probe() -> bool:
    raise RuntimeError("raw database connection detail")


def seed_streaming_service() -> StreamingService:
    builder = PlaybackUrlBuilder(
        PlaybackUrlBuilderConfig(
            public_webrtc_base_url="https://media.example.test/webrtc",
            public_hls_base_url="https://media.example.test/hls",
        )
    )
    return StreamingService(playback_url_builder=builder)


def test_healthz_returns_process_liveness_without_dependency_checks():
    with TestClient(app) as client:
        response = client.get("/healthz")

    assert response.status_code == 200
    assert response.json() == {
        "service": "gcs-backend",
        "status": "ok",
        "checks": [{"name": "api", "status": "ok", "required": True, "reason": None}],
    }


def test_readyz_returns_ok_when_required_dependencies_are_ready():
    app.dependency_overrides[get_database_probe] = lambda: ready_database_probe
    app.dependency_overrides[get_v1_streaming_service] = seed_streaming_service

    with TestClient(app) as client:
        response = client.get("/readyz")

    app.dependency_overrides.clear()

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "ok"
    assert {check["name"]: check["status"] for check in payload["checks"]} == {
        "database": "ok",
        "streaming_registry": "ok",
        "playback_url_builder": "ok",
    }


def test_readyz_returns_503_and_sanitized_reason_when_database_is_not_ready():
    app.dependency_overrides[get_database_probe] = lambda: failing_database_probe
    app.dependency_overrides[get_v1_streaming_service] = seed_streaming_service

    with TestClient(app) as client:
        response = client.get("/readyz")

    app.dependency_overrides.clear()

    assert response.status_code == 503
    payload = response.json()
    assert payload["status"] == "error"
    assert "secret" not in response.text
    assert "mysql+pymysql" not in response.text
    assert {
        "name": "database",
        "status": "error",
        "required": True,
        "reason": "database readiness query failed",
    } in payload["checks"]


def test_readyz_returns_503_when_streaming_module_is_not_ready():
    app.dependency_overrides[get_database_probe] = lambda: ready_database_probe
    app.dependency_overrides[get_v1_streaming_service] = lambda: BrokenStreamingService()

    with TestClient(app) as client:
        response = client.get("/readyz")

    app.dependency_overrides.clear()

    assert response.status_code == 503
    assert response.json() == {
        "service": "gcs-backend",
        "status": "error",
        "checks": [
            {"name": "database", "status": "ok", "required": True, "reason": None},
            {
                "name": "streaming_registry",
                "status": "error",
                "required": True,
                "reason": "stream registry is not ready",
            },
            {
                "name": "playback_url_builder",
                "status": "error",
                "required": True,
                "reason": "playback url builder is not ready",
            },
        ],
    }
