import pytest

from modules.ai_contract import AIEndpointResponse
from modules.ai_contract.constants import (
    MOCK_AI_DETECTION_BBOX,
    MOCK_AI_DETECTION_CONFIDENCE,
    MOCK_AI_DETECTION_LABEL,
    MOCK_AI_DETECTION_TRACK_ID,
    MOCK_AI_REPORT_TEXT,
    MOCK_AI_RISK_SCORE,
)
from modules.protocol_v2.ai_overlay import (
    AiOverlayEventPayload,
    DEFAULT_AI_MODEL_ID,
    OverlayPointPayload,
    bounding_box_from_points,
    dashboard_response_from_overlay_events,
    events_from_dashboard_response,
)
from tests.fixtures.ai_contract_payloads import (
    AI_SAMPLE_GENERATED_AT,
    AI_SAMPLE_OBSERVED_UNIX_MILLIS,
    AI_SAMPLE_REAR_STREAM_ID,
    AI_SAMPLE_RECEIVED_UNIX_MILLIS,
    AI_SAMPLE_STREAM_ID,
    valid_ai_frame_payload,
)


def dashboard_ai_response() -> AIEndpointResponse:
    return AIEndpointResponse.model_validate(
        {
            "streamId": AI_SAMPLE_STREAM_ID,
            "frame": valid_ai_frame_payload(),
            "generatedAt": AI_SAMPLE_GENERATED_AT,
            "riskScore": MOCK_AI_RISK_SCORE,
            "reportText": MOCK_AI_REPORT_TEXT,
            "detections": [
                {
                    "label": MOCK_AI_DETECTION_LABEL,
                    "bbox": MOCK_AI_DETECTION_BBOX,
                    "confidence": MOCK_AI_DETECTION_CONFIDENCE,
                    "riskScore": MOCK_AI_RISK_SCORE,
                    "trackId": MOCK_AI_DETECTION_TRACK_ID,
                }
            ],
        }
    )


def test_ai_overlay_event_round_trips_between_dashboard_dto_and_protobuf() -> None:
    response = dashboard_ai_response()

    events = events_from_dashboard_response(response)
    decoded_events = tuple(AiOverlayEventPayload.from_protobuf_wire(event.to_protobuf_wire()) for event in events)
    restored = dashboard_response_from_overlay_events(
        stream_id=response.stream_id,
        frame=response.frame,
        generated_at=response.generated_at,
        events=decoded_events,
        risk_score=response.risk_score,
        report_text=response.report_text,
    )

    assert len(decoded_events) == 1
    event = decoded_events[0]
    assert event.event_id == MOCK_AI_DETECTION_TRACK_ID
    assert event.stream_id == AI_SAMPLE_STREAM_ID
    assert event.model_id == DEFAULT_AI_MODEL_ID
    assert event.label == MOCK_AI_DETECTION_LABEL
    assert event.confidence == MOCK_AI_DETECTION_CONFIDENCE
    assert event.observed_unix_millis == AI_SAMPLE_OBSERVED_UNIX_MILLIS
    assert event.received_unix_millis == AI_SAMPLE_RECEIVED_UNIX_MILLIS
    assert restored.model_dump(by_alias=True)["detections"][0]["bbox"] == MOCK_AI_DETECTION_BBOX


def test_ai_overlay_event_refuses_to_mix_stream_ids_for_dashboard_delivery() -> None:
    response = dashboard_ai_response()
    event = events_from_dashboard_response(response)[0]
    mismatched = AiOverlayEventPayload.create(
        stream_id=AI_SAMPLE_REAR_STREAM_ID,
        label=event.label,
        confidence=event.confidence,
        points=event.points,
        event_id=event.event_id,
        observed_unix_millis=event.observed_unix_millis,
        received_unix_millis=event.received_unix_millis,
    )

    with pytest.raises(ValueError, match="overlay events must belong"):
        dashboard_response_from_overlay_events(
            stream_id=response.stream_id,
            frame=response.frame,
            generated_at=response.generated_at,
            events=(mismatched,),
            risk_score=response.risk_score,
        )


def test_ai_overlay_bbox_requires_normalized_non_empty_points() -> None:
    with pytest.raises(ValueError, match="normalized"):
        bounding_box_from_points(
            (
                OverlayPointPayload(x=0.9, y=0.1),
                OverlayPointPayload(x=1.1, y=0.2),
            )
        )
