from datetime import datetime, timezone

import pytest

from modules.ai_contract import AIEndpointResponse
from modules.protocol_v2.ai_overlay import (
    AiOverlayEventPayload,
    DEFAULT_AI_MODEL_ID,
    OverlayPointPayload,
    bounding_box_from_points,
    dashboard_response_from_overlay_events,
    events_from_dashboard_response,
)


FRAME_PAYLOAD = {
    "streamId": "raw.sample.front",
    "frameId": "frame-0001",
    "capturedAt": "2026-05-22T08:00:00Z",
    "ptsMs": 1200,
}
GENERATED_AT = datetime(2026, 5, 22, 8, 0, 1, tzinfo=timezone.utc)


def dashboard_ai_response() -> AIEndpointResponse:
    return AIEndpointResponse.model_validate(
        {
            "streamId": "raw.sample.front",
            "frame": FRAME_PAYLOAD,
            "generatedAt": GENERATED_AT,
            "riskScore": 0.72,
            "reportText": "Mock AI detected a person near the sample stream.",
            "detections": [
                {
                    "label": "person",
                    "bbox": {"x": 0.18, "y": 0.22, "width": 0.24, "height": 0.34},
                    "confidence": 0.88,
                    "riskScore": 0.72,
                    "trackId": "mock-person-001",
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
    assert event.event_id == "mock-person-001"
    assert event.stream_id == "raw.sample.front"
    assert event.model_id == DEFAULT_AI_MODEL_ID
    assert event.label == "person"
    assert event.confidence == 0.88
    assert event.observed_unix_millis == 1_779_436_800_000
    assert event.received_unix_millis == 1_779_436_801_000
    assert restored.model_dump(by_alias=True)["detections"][0]["bbox"] == {
        "x": 0.18,
        "y": 0.22,
        "width": 0.24,
        "height": 0.34,
    }


def test_ai_overlay_event_refuses_to_mix_stream_ids_for_dashboard_delivery() -> None:
    response = dashboard_ai_response()
    event = events_from_dashboard_response(response)[0]
    mismatched = AiOverlayEventPayload.create(
        stream_id="raw.sample.rear",
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
