from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from time import time
from uuid import uuid4

from modules.ai_contract.schemas import AIEndpointResponse, FrameReference
from modules.protocol_v2 import ai_overlay_dashboard
from modules.protocol_v2.ai_overlay_contract import (
    DEFAULT_AI_MODEL_ID,
    DEFAULT_AI_REPORT_TEXT,
    OverlayKinds,
)
from modules.protocol_v2.ai_overlay_geometry import bounding_box_from_points
from modules.protocol_v2.ai_overlay_points import OverlayPointPayload
from modules.protocol_v2.ai_overlay_wire import decode_overlay_event, encode_overlay_event

__all__ = [
    "AiOverlayEventPayload",
    "bounding_box_from_points",
    "dashboard_response_from_overlay_events",
    "events_from_dashboard_response",
]


@dataclass(frozen=True)
class AiOverlayEventPayload:
    event_id: str
    stream_id: str
    model_id: str
    kind: int
    label: str
    confidence: float
    points: tuple[OverlayPointPayload, ...]
    latitude: float
    longitude: float
    altitude_m: float
    observed_unix_millis: int
    received_unix_millis: int

    @classmethod
    def create(
        cls,
        *,
        stream_id: str,
        label: str,
        confidence: float,
        points: tuple[OverlayPointPayload, ...],
        model_id: str = DEFAULT_AI_MODEL_ID,
        kind: int = OverlayKinds.BOUNDING_BOX,
        latitude: float = 0,
        longitude: float = 0,
        altitude_m: float = 0,
        event_id: str | None = None,
        observed_unix_millis: int | None = None,
        received_unix_millis: int | None = None,
    ) -> "AiOverlayEventPayload":
        now = int(time() * 1000)
        return cls(
            event_id=event_id or str(uuid4()),
            stream_id=stream_id,
            model_id=model_id,
            kind=kind,
            label=label,
            confidence=confidence,
            points=points,
            latitude=latitude,
            longitude=longitude,
            altitude_m=altitude_m,
            observed_unix_millis=observed_unix_millis or now,
            received_unix_millis=received_unix_millis or now,
        )

    def to_protobuf_wire(self) -> bytes:
        return encode_overlay_event(self)

    @classmethod
    def from_protobuf_wire(cls, payload: bytes) -> "AiOverlayEventPayload":
        decoded = decode_overlay_event(payload)
        return cls(
            event_id=decoded.event_id,
            stream_id=decoded.stream_id,
            model_id=decoded.model_id,
            kind=decoded.kind,
            label=decoded.label,
            confidence=decoded.confidence,
            points=decoded.points,
            latitude=decoded.latitude,
            longitude=decoded.longitude,
            altitude_m=decoded.altitude_m,
            observed_unix_millis=decoded.observed_unix_millis,
            received_unix_millis=decoded.received_unix_millis,
        )

    def to_dashboard_detection(self, *, risk_score: float) -> dict[str, object]:
        return ai_overlay_dashboard.detection_from_overlay_event(
            event_id=self.event_id,
            label=self.label,
            confidence=self.confidence,
            points=self.points,
            risk_score=risk_score,
        )


def events_from_dashboard_response(
    response: AIEndpointResponse,
    *,
    model_id: str = DEFAULT_AI_MODEL_ID,
) -> tuple[AiOverlayEventPayload, ...]:
    return ai_overlay_dashboard.events_from_dashboard_response(
        response,
        model_id=model_id,
        payload_factory=AiOverlayEventPayload.create,
    )


def dashboard_response_from_overlay_events(
    *,
    stream_id: str,
    frame: FrameReference,
    generated_at: datetime,
    events: tuple[AiOverlayEventPayload, ...],
    risk_score: float,
    report_text: str = DEFAULT_AI_REPORT_TEXT,
) -> AIEndpointResponse:
    return ai_overlay_dashboard.dashboard_response_from_overlay_events(
        stream_id=stream_id,
        frame=frame,
        generated_at=generated_at,
        events=events,
        risk_score=risk_score,
        report_text=report_text,
    )
