from __future__ import annotations

from datetime import datetime
from typing import Callable, Protocol, TypeVar

from modules.ai_contract.schemas import AIEndpointResponse, FrameReference
from modules.protocol_v2.ai_overlay_contract import DEFAULT_AI_MODEL_ID, DEFAULT_AI_REPORT_TEXT
from modules.protocol_v2.ai_overlay_geometry import bounding_box_from_points
from modules.protocol_v2.ai_overlay_points import OverlayPointPayload, points_from_bbox
from modules.protocol_v2.wire_helpers import unix_millis


class DashboardOverlayEvent(Protocol):
    @property
    def stream_id(self) -> str: ...

    def to_dashboard_detection(self, *, risk_score: float) -> dict[str, object]: ...


OverlayEventT = TypeVar("OverlayEventT", bound=DashboardOverlayEvent)


def detection_from_overlay_event(
    *,
    event_id: str,
    label: str,
    confidence: float,
    points: tuple[OverlayPointPayload, ...],
    risk_score: float,
) -> dict[str, object]:
    return {
        "label": label,
        "bbox": bounding_box_from_points(points),
        "confidence": confidence,
        "riskScore": risk_score,
        "trackId": event_id,
    }


def events_from_dashboard_response(
    response: AIEndpointResponse,
    *,
    model_id: str,
    payload_factory: Callable[..., OverlayEventT],
) -> tuple[OverlayEventT, ...]:
    observed_millis = unix_millis(response.frame.captured_at)
    received_millis = unix_millis(response.generated_at)
    return tuple(
        payload_factory(
            stream_id=response.stream_id,
            label=detection.label,
            confidence=detection.confidence,
            points=points_from_bbox(
                detection.bbox.x,
                detection.bbox.y,
                detection.bbox.width,
                detection.bbox.height,
            ),
            model_id=model_id or DEFAULT_AI_MODEL_ID,
            event_id=detection.track_id,
            observed_unix_millis=observed_millis,
            received_unix_millis=received_millis,
        )
        for detection in response.detections
    )


def dashboard_response_from_overlay_events(
    *,
    stream_id: str,
    frame: FrameReference,
    generated_at: datetime,
    events: tuple[DashboardOverlayEvent, ...],
    risk_score: float,
    report_text: str = DEFAULT_AI_REPORT_TEXT,
) -> AIEndpointResponse:
    if any(getattr(event, "stream_id") != stream_id for event in events):
        raise ValueError("all overlay events must belong to the dashboard streamId")
    return AIEndpointResponse.model_validate(
        {
            "streamId": stream_id,
            "frame": frame.model_dump(by_alias=True),
            "generatedAt": generated_at,
            "riskScore": risk_score,
            "reportText": report_text,
            "detections": [event.to_dashboard_detection(risk_score=risk_score) for event in events],
        }
    )
