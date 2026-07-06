import asyncio
import inspect

import pytest
from pydantic import ValidationError

from modules.ai_contract import (
    AI_CONTRACT_SCHEMA_VERSION,
    AIEndpointErrorResponse,
    AIEndpointRequest,
    AIEndpointResponse,
    MockAIService,
)
from tests.fixtures.ai_contract_payloads import (
    AI_SAMPLE_GENERATED_AT,
    AI_SAMPLE_REAR_STREAM_ID,
    AI_SAMPLE_STREAM_ID,
    valid_ai_frame_payload,
    valid_ai_request_payload,
)


def test_ai_endpoint_request_accepts_versioned_stream_frame_reference():
    request = AIEndpointRequest.model_validate(valid_ai_request_payload())

    assert request.schema_version == AI_CONTRACT_SCHEMA_VERSION
    assert request.stream_id == AI_SAMPLE_STREAM_ID
    assert request.frame.stream_id == AI_SAMPLE_STREAM_ID
    assert request.frame.captured_at.tzinfo is not None
    assert request.model_dump(by_alias=True)["schemaVersion"] == AI_CONTRACT_SCHEMA_VERSION


def test_ai_endpoint_request_rejects_unknown_schema_version():
    payload = valid_ai_request_payload()
    payload["schemaVersion"] = "ai.detection.v2"

    with pytest.raises(ValidationError):
        AIEndpointRequest.model_validate(payload)


def test_ai_endpoint_request_rejects_naive_timestamps():
    payload = valid_ai_request_payload()
    frame = valid_ai_frame_payload(captured_at="2026-05-22T08:00:00")
    payload["frame"] = frame

    with pytest.raises(ValidationError):
        AIEndpointRequest.model_validate(payload)


def test_ai_endpoint_request_rejects_mismatched_frame_stream():
    payload = valid_ai_request_payload()
    frame = valid_ai_frame_payload(stream_id=AI_SAMPLE_REAR_STREAM_ID)
    payload["frame"] = frame

    with pytest.raises(ValidationError, match="frame.streamId must match streamId"):
        AIEndpointRequest.model_validate(payload)


def test_ai_endpoint_request_requires_frame_data_or_image_url():
    payload = valid_ai_request_payload()
    payload.pop("imageUrl")

    with pytest.raises(ValidationError, match="imageUrl or frameDataBase64 is required"):
        AIEndpointRequest.model_validate(payload)


def test_ai_endpoint_response_serializes_dashboard_display_fields():
    response = AIEndpointResponse.model_validate(
        {
            "schemaVersion": AI_CONTRACT_SCHEMA_VERSION,
            "streamId": AI_SAMPLE_STREAM_ID,
            "frame": valid_ai_frame_payload(),
            "generatedAt": AI_SAMPLE_GENERATED_AT,
            "riskScore": 0.82,
            "reportText": "작업자 접근 위험 감지",
            "detections": [
                {
                    "label": "person",
                    "bbox": {"x": 0.1, "y": 0.2, "width": 0.3, "height": 0.4},
                    "confidence": 0.91,
                    "riskScore": 0.82,
                    "trackId": "trk-001",
                }
            ],
        }
    )

    payload = response.model_dump(by_alias=True)

    assert payload["schemaVersion"] == AI_CONTRACT_SCHEMA_VERSION
    assert payload["riskScore"] == 0.82
    assert payload["reportText"] == "작업자 접근 위험 감지"
    assert payload["detections"][0]["bbox"] == {"x": 0.1, "y": 0.2, "width": 0.3, "height": 0.4}


@pytest.mark.parametrize(
    "bbox",
    [
        {"x": -0.1, "y": 0.2, "width": 0.3, "height": 0.4},
        {"x": 0.8, "y": 0.2, "width": 0.3, "height": 0.4},
        {"x": 0.1, "y": 0.9, "width": 0.3, "height": 0.2},
    ],
)
def test_ai_endpoint_response_rejects_invalid_bbox(bbox: dict[str, float]):
    with pytest.raises(ValidationError):
        AIEndpointResponse.model_validate(
            {
                "schemaVersion": AI_CONTRACT_SCHEMA_VERSION,
                "streamId": AI_SAMPLE_STREAM_ID,
                "frame": valid_ai_frame_payload(),
                "generatedAt": AI_SAMPLE_GENERATED_AT,
                "riskScore": 0.82,
                "reportText": "작업자 접근 위험 감지",
                "detections": [
                    {
                        "label": "person",
                        "bbox": bbox,
                        "confidence": 0.91,
                        "riskScore": 0.82,
                    }
                ],
            }
        )


def test_ai_endpoint_response_rejects_raw_media_payload_fields():
    payload = {
        "schemaVersion": AI_CONTRACT_SCHEMA_VERSION,
        "streamId": AI_SAMPLE_STREAM_ID,
        "frame": valid_ai_frame_payload(),
        "generatedAt": AI_SAMPLE_GENERATED_AT,
        "riskScore": 0.82,
        "reportText": "작업자 접근 위험 감지",
        "detections": [],
        "frameDataBase64": "raw-frame-bytes-must-not-return-from-sidecar",
    }

    with pytest.raises(ValidationError):
        AIEndpointResponse.model_validate(payload)


def test_ai_endpoint_error_response_uses_versioned_error_schema():
    response = AIEndpointErrorResponse.model_validate(
        {
            "schemaVersion": AI_CONTRACT_SCHEMA_VERSION,
            "streamId": AI_SAMPLE_STREAM_ID,
            "frame": valid_ai_frame_payload(),
            "generatedAt": AI_SAMPLE_GENERATED_AT,
            "error": {
                "code": "AI_TIMEOUT",
                "message": "AI endpoint timed out",
                "retryable": True,
            },
        }
    )

    payload = response.model_dump(by_alias=True)

    assert payload["schemaVersion"] == AI_CONTRACT_SCHEMA_VERSION
    assert payload["error"] == {
        "code": "AI_TIMEOUT",
        "message": "AI endpoint timed out",
        "retryable": True,
    }


def test_ai_endpoint_contract_rejects_unknown_payload_fields():
    payload = valid_ai_request_payload()
    payload["unexpectedField"] = True

    with pytest.raises(ValidationError):
        AIEndpointRequest.model_validate(payload)


def test_mock_ai_service_uses_async_provider_boundary():
    service = MockAIService(generated_at=AI_SAMPLE_GENERATED_AT)
    request = AIEndpointRequest.model_validate(valid_ai_request_payload())

    assert inspect.iscoroutinefunction(service.detect)
    assert inspect.iscoroutinefunction(service.build_error)

    response = asyncio.run(service.detect(request))
    error = asyncio.run(service.build_error(request))

    assert response.generated_at == AI_SAMPLE_GENERATED_AT
    assert error.generated_at == AI_SAMPLE_GENERATED_AT
