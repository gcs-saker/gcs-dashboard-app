from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient

from api.stream import get_v1_streaming_service
import api.stream as stream_api_module
from main import app
from modules.streaming import PlaybackUrlBuilder, PlaybackUrlBuilderConfig, StreamingService


@pytest.fixture
def client() -> Generator[TestClient, None, None]:
    builder = PlaybackUrlBuilder(
        PlaybackUrlBuilderConfig(
            public_webrtc_base_url="https://media.example.com/webrtc",
            public_hls_base_url="https://media.example.com/hls",
        )
    )
    service = StreamingService(playback_url_builder=builder)
    app.dependency_overrides[get_v1_streaming_service] = lambda: service

    with TestClient(app) as test_client:
        yield test_client

    app.dependency_overrides.clear()


def test_stream_api_v1_lists_registered_seed_streams(client: TestClient, auth_headers):
    response = client.get("/api/v1/streams", headers=auth_headers("viewer01", "viewer"))

    assert response.status_code == 200
    payload = response.json()
    assert [stream["streamId"] for stream in payload] == [
        "raw.sample.front",
        "raw.sample.thermal",
        "raw.sample.rear",
        "raw.local.webcam",
    ]
    assert payload[0]["status"] == "online"
    assert payload[0]["playbackUrls"] == {
        "webrtc": "https://media.example.com/webrtc/raw/sample/front/whep",
        "hls": "https://media.example.com/hls/raw/sample/front/index.m3u8",
    }


def test_stream_api_v1_dependency_exposes_default_seed_service():
    assert get_v1_streaming_service().module_status().registered_streams == 4


def test_stream_api_v1_returns_default_stun_ice_server(client: TestClient, auth_headers, monkeypatch):
    monkeypatch.delenv("WEBRTC_TURN_URL", raising=False)
    monkeypatch.delenv("WEBRTC_TURN_USERNAME", raising=False)
    monkeypatch.delenv("WEBRTC_TURN_PASSWORD", raising=False)
    monkeypatch.delenv("MEDIAMTX_TURN_URL", raising=False)
    monkeypatch.delenv("MEDIAMTX_TURN_USERNAME", raising=False)
    monkeypatch.delenv("MEDIAMTX_TURN_PASSWORD", raising=False)

    response = client.get("/api/v1/streams/ice-servers", headers=auth_headers("viewer01", "viewer"))

    assert response.status_code == 200
    assert response.json() == [{"urls": "stun:localhost:3478", "username": None, "credential": None}]


def test_stream_api_v1_returns_turn_ice_server_from_env(client: TestClient, auth_headers, monkeypatch):
    monkeypatch.setenv("WEBRTC_STUN_URL", "stun:stun.example.test:3478")
    monkeypatch.setenv("WEBRTC_TURN_URL", "turn:turn.example.test:3478?transport=udp")
    monkeypatch.setenv("WEBRTC_TURN_USERNAME", "gcs-turn")
    monkeypatch.setenv("WEBRTC_TURN_PASSWORD", "test-secret")

    response = client.get("/api/v1/streams/ice-servers", headers=auth_headers("viewer01", "viewer"))

    assert response.status_code == 200
    assert response.json() == [
        {"urls": "stun:stun.example.test:3478", "username": None, "credential": None},
        {
            "urls": "turn:turn.example.test:3478?transport=udp",
            "username": "gcs-turn",
            "credential": "test-secret",
        },
    ]


def test_stream_ice_server_route_stays_before_stream_id_route():
    route_paths = [getattr(route, "path", "") for route in stream_api_module.v1_router.routes]

    assert route_paths.index("/streams/ice-servers") < route_paths.index("/streams/{stream_id}")


def test_legacy_stream_status_route_stays_available(client: TestClient):
    response = client.get("/stream/status")

    assert response.status_code == 200
    assert response.json() == {"stream": "ready"}


def test_prometheus_metrics_route_stays_available(client: TestClient):
    response = client.get("/metrics")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/plain")
    assert "python_info" in response.text


def test_stream_api_v1_returns_stream_detail(client: TestClient, auth_headers):
    response = client.get(
        "/api/v1/streams/raw.sample.front",
        headers=auth_headers("viewer01", "viewer"),
    )

    assert response.status_code == 200
    assert response.json() == {
        "streamId": "raw.sample.front",
        "path": "raw/sample/front",
        "prefix": "raw",
        "assetId": "sample",
        "sensorId": "front",
        "processorId": None,
        "date": None,
        "status": "online",
        "displayName": "Sample Front Camera",
        "playbackUrls": {
            "webrtc": "https://media.example.com/webrtc/raw/sample/front/whep",
            "hls": "https://media.example.com/hls/raw/sample/front/index.m3u8",
        },
    }


def test_stream_api_v1_returns_playback_urls_with_webrtc_primary_and_hls_fallback(
    client: TestClient,
    auth_headers,
):
    response = client.get(
        "/api/v1/streams/raw.sample.front/playback",
        headers=auth_headers("viewer01", "viewer"),
    )

    assert response.status_code == 200
    assert response.json() == {
        "streamId": "raw.sample.front",
        "status": "online",
        "playbackUrls": {
            "webrtc": "https://media.example.com/webrtc/raw/sample/front/whep",
            "hls": "https://media.example.com/hls/raw/sample/front/index.m3u8",
        },
    }


def test_stream_api_v1_returns_stream_status(client: TestClient, auth_headers):
    response = client.get(
        "/api/v1/streams/raw.sample.front/status",
        headers=auth_headers("viewer01", "viewer"),
    )

    assert response.status_code == 200
    assert response.json() == {"streamId": "raw.sample.front", "status": "online"}


def test_stream_api_v1_returns_local_webcam_test_stream(client: TestClient, auth_headers):
    response = client.get(
        "/api/v1/streams/raw.local.webcam/playback",
        headers=auth_headers("viewer01", "viewer"),
    )

    assert response.status_code == 200
    assert response.json() == {
        "streamId": "raw.local.webcam",
        "status": "registered",
        "playbackUrls": {
            "webrtc": "https://media.example.com/webrtc/raw/local/webcam/whep",
            "hls": "https://media.example.com/hls/raw/local/webcam/index.m3u8",
        },
    }


@pytest.mark.parametrize(
    ("path", "expected_status", "expected_detail"),
    [
        ("/api/v1/streams/bad", 422, "stream path prefix must be one of raw, ai, archive"),
        ("/api/v1/streams/raw.missing.front", 404, "stream is not registered"),
    ],
)
def test_stream_api_v1_returns_clear_errors_for_invalid_or_missing_streams(
    client: TestClient,
    auth_headers,
    path: str,
    expected_status: int,
    expected_detail: str,
):
    response = client.get(path, headers=auth_headers("viewer01", "viewer"))

    assert response.status_code == expected_status
    assert response.json() == {"detail": expected_detail}
