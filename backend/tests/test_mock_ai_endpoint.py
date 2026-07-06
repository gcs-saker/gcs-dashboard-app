from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient

from api.stream import get_v1_streaming_service
from main import app
from modules.ai_contract import (
    AI_CONTRACT_SCHEMA_VERSION,
    AI_MOCK_UNAVAILABLE_STATUS_CODE,
    MOCK_AI_DETECTION_BBOX,
    MOCK_AI_ERROR_CODE,
    MOCK_AI_ERROR_MESSAGE,
    MOCK_AI_REPORT_TEXT,
    MOCK_AI_RISK_SCORE,
)
from modules.streaming import PlaybackUrlBuilder, PlaybackUrlBuilderConfig, StreamingService
from tests.fixtures.ai_contract_payloads import (
    AI_SAMPLE_FRAME_ID,
    AI_SAMPLE_STREAM_ID,
    valid_ai_request_payload,
)


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


def test_mock_ai_endpoint_returns_contract_shaped_detection_response(client: TestClient, auth_headers):
    response = client.post(
        "/api/v1/ai/mock/detections",
        json=valid_ai_request_payload(),
        headers=auth_headers("operator01", "operator"),
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["schemaVersion"] == AI_CONTRACT_SCHEMA_VERSION
    assert payload["streamId"] == AI_SAMPLE_STREAM_ID
    assert payload["frame"]["frameId"] == AI_SAMPLE_FRAME_ID
    assert payload["generatedAt"].endswith("Z")
    assert payload["riskScore"] == MOCK_AI_RISK_SCORE
    assert payload["reportText"] == MOCK_AI_REPORT_TEXT
    assert payload["detections"][0]["bbox"] == MOCK_AI_DETECTION_BBOX


def test_mock_ai_endpoint_supports_latency_simulation_option(client: TestClient, auth_headers):
    response = client.post(
        "/api/v1/ai/mock/detections?latencyMs=1",
        json=valid_ai_request_payload(),
        headers=auth_headers("operator01", "operator"),
    )

    assert response.status_code == 200
    assert response.json()["schemaVersion"] == AI_CONTRACT_SCHEMA_VERSION


def test_mock_ai_endpoint_supports_error_simulation_option(client: TestClient, auth_headers):
    response = client.post(
        "/api/v1/ai/mock/detections?simulateError=true",
        json=valid_ai_request_payload(),
        headers=auth_headers("operator01", "operator"),
    )

    assert response.status_code == AI_MOCK_UNAVAILABLE_STATUS_CODE
    payload = response.json()
    assert payload["schemaVersion"] == AI_CONTRACT_SCHEMA_VERSION
    assert payload["error"] == {
        "code": MOCK_AI_ERROR_CODE,
        "message": MOCK_AI_ERROR_MESSAGE,
        "retryable": True,
    }


def test_mock_ai_endpoint_validates_contract_payload(client: TestClient, auth_headers):
    payload = valid_ai_request_payload()
    payload["schemaVersion"] = "ai.detection.v2"

    response = client.post(
        "/api/v1/ai/mock/detections",
        json=payload,
        headers=auth_headers("operator01", "operator"),
    )

    assert response.status_code == 422


def test_mock_ai_error_does_not_block_streaming_playback_api(client: TestClient, auth_headers):
    headers = auth_headers("operator01", "operator")
    ai_response = client.post(
        "/api/v1/ai/mock/detections?simulateError=true",
        json=valid_ai_request_payload(),
        headers=headers,
    )
    playback_response = client.get("/api/v1/streams/raw.sample.front/playback", headers=headers)

    assert ai_response.status_code == AI_MOCK_UNAVAILABLE_STATUS_CODE
    assert playback_response.status_code == 200
    assert playback_response.json()["playbackUrls"]["webrtc"].endswith("/raw/sample/front/whep")
