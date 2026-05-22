from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient

from api.stream import get_v1_streaming_service
from main import app
from modules.ai_contract import AI_CONTRACT_SCHEMA_VERSION
from modules.streaming import PlaybackUrlBuilder, PlaybackUrlBuilderConfig, StreamingService


@pytest.fixture
def client() -> Generator[TestClient, None, None]:
    builder = PlaybackUrlBuilder(
        PlaybackUrlBuilderConfig(
            public_webrtc_base_url="https://media.example.test/webrtc",
            public_hls_base_url="https://media.example.test/hls",
        )
    )
    service = StreamingService(playback_url_builder=builder)
    app.dependency_overrides[get_v1_streaming_service] = lambda: service

    with TestClient(app) as test_client:
        yield test_client

    app.dependency_overrides.clear()


def valid_ai_request() -> dict[str, object]:
    return {
        "schemaVersion": AI_CONTRACT_SCHEMA_VERSION,
        "streamId": "raw.sample.front",
        "frame": {
            "streamId": "raw.sample.front",
            "frameId": "frame-0001",
            "capturedAt": "2026-05-22T08:00:00Z",
            "ptsMs": 1200,
        },
        "imageUrl": "https://media.example.test/raw/sample/front/frame-0001.jpg",
    }


def test_mock_ai_endpoint_returns_contract_shaped_detection_response(client: TestClient):
    response = client.post("/api/v1/ai/mock/detections", json=valid_ai_request())

    assert response.status_code == 200
    payload = response.json()
    assert payload["schemaVersion"] == AI_CONTRACT_SCHEMA_VERSION
    assert payload["streamId"] == "raw.sample.front"
    assert payload["frame"]["frameId"] == "frame-0001"
    assert payload["generatedAt"].endswith("Z")
    assert payload["riskScore"] == 0.72
    assert payload["reportText"] == "Mock AI detected a person near the sample stream."
    assert payload["detections"][0]["bbox"] == {
        "x": 0.18,
        "y": 0.22,
        "width": 0.24,
        "height": 0.34,
    }


def test_mock_ai_endpoint_supports_latency_simulation_option(client: TestClient):
    response = client.post("/api/v1/ai/mock/detections?latencyMs=1", json=valid_ai_request())

    assert response.status_code == 200
    assert response.json()["schemaVersion"] == AI_CONTRACT_SCHEMA_VERSION


def test_mock_ai_endpoint_supports_error_simulation_option(client: TestClient):
    response = client.post(
        "/api/v1/ai/mock/detections?simulateError=true",
        json=valid_ai_request(),
    )

    assert response.status_code == 503
    payload = response.json()
    assert payload["schemaVersion"] == AI_CONTRACT_SCHEMA_VERSION
    assert payload["error"] == {
        "code": "AI_SIMULATED_ERROR",
        "message": "Mock AI endpoint simulated an error.",
        "retryable": True,
    }


def test_mock_ai_endpoint_validates_contract_payload(client: TestClient):
    payload = valid_ai_request()
    payload["schemaVersion"] = "ai.detection.v2"

    response = client.post("/api/v1/ai/mock/detections", json=payload)

    assert response.status_code == 422


def test_mock_ai_error_does_not_block_streaming_playback_api(client: TestClient):
    ai_response = client.post(
        "/api/v1/ai/mock/detections?simulateError=true",
        json=valid_ai_request(),
    )
    playback_response = client.get("/api/v1/streams/raw.sample.front/playback")

    assert ai_response.status_code == 503
    assert playback_response.status_code == 200
    assert playback_response.json()["playbackUrls"]["webrtc"].endswith("/raw/sample/front/whep")
