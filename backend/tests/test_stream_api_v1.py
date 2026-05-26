from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient

from api.stream import get_v1_streaming_service
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
    ]
    assert payload[0]["status"] == "online"
    assert payload[0]["playbackUrls"] == {
        "webrtc": "https://media.example.com/webrtc/raw/sample/front/whep",
        "hls": "https://media.example.com/hls/raw/sample/front/index.m3u8",
    }


def test_stream_api_v1_dependency_exposes_default_seed_service():
    assert get_v1_streaming_service().module_status().registered_streams == 3


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
