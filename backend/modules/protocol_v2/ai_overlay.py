from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from time import time
from uuid import uuid4

from modules.ai_contract.schemas import AIEndpointResponse, FrameReference
from modules.protocol_v2.telemetry import (
    GeoPointFields,
    TimestampedFields,
    geo_point_wire,
    single_float,
    single_int,
    single_message,
    single_string,
    timestamped_wire,
)
from modules.protocol_v2.wire import (
    DecodedWireMessage,
    decode_message,
    encode_bytes,
    encode_double,
    encode_string,
    encode_varint_field,
)


class AiOverlayEventFields:
    EVENT_ID = 1
    STREAM_ID = 2
    MODEL_ID = 3
    KIND = 4
    LABEL = 5
    CONFIDENCE = 6
    POINT = 7
    GEO_ANCHOR = 8
    TIME = 9


class OverlayPointFields:
    X = 1
    Y = 2


class OverlayKinds:
    UNSPECIFIED = 0
    BOUNDING_BOX = 1
    POLYGON = 2
    LABEL = 3
    AUDIO_ALERT = 4


DEFAULT_AI_MODEL_ID = "mock-ai-sidecar-v1"
DEFAULT_AI_REPORT_TEXT = "AI overlay metadata event received."


@dataclass(frozen=True)
class OverlayPointPayload:
    x: float
    y: float

    def to_protobuf_wire(self) -> bytes:
        payload = bytearray()
        encode_double(payload, OverlayPointFields.X, self.x)
        encode_double(payload, OverlayPointFields.Y, self.y)
        return bytes(payload)

    @classmethod
    def from_protobuf_wire(cls, payload: bytes) -> "OverlayPointPayload":
        decoded = decode_message(payload)
        return cls(
            x=single_float(decoded, OverlayPointFields.X),
            y=single_float(decoded, OverlayPointFields.Y),
        )


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
        payload = bytearray()
        encode_string(payload, AiOverlayEventFields.EVENT_ID, self.event_id)
        encode_string(payload, AiOverlayEventFields.STREAM_ID, self.stream_id)
        encode_string(payload, AiOverlayEventFields.MODEL_ID, self.model_id)
        encode_varint_field(payload, AiOverlayEventFields.KIND, self.kind)
        encode_string(payload, AiOverlayEventFields.LABEL, self.label)
        encode_double(payload, AiOverlayEventFields.CONFIDENCE, self.confidence)
        for point in self.points:
            encode_bytes(payload, AiOverlayEventFields.POINT, point.to_protobuf_wire())
        encode_bytes(payload, AiOverlayEventFields.GEO_ANCHOR, geo_point_wire(self.latitude, self.longitude, self.altitude_m))
        encode_bytes(payload, AiOverlayEventFields.TIME, timestamped_wire(self.observed_unix_millis, self.received_unix_millis))
        return bytes(payload)

    @classmethod
    def from_protobuf_wire(cls, payload: bytes) -> "AiOverlayEventPayload":
        decoded = decode_message(payload)
        geo_anchor = optional_message(decoded, AiOverlayEventFields.GEO_ANCHOR)
        time_message = single_message(decoded, AiOverlayEventFields.TIME)
        return cls(
            event_id=single_string(decoded, AiOverlayEventFields.EVENT_ID),
            stream_id=single_string(decoded, AiOverlayEventFields.STREAM_ID),
            model_id=single_string(decoded, AiOverlayEventFields.MODEL_ID),
            kind=single_int(decoded, AiOverlayEventFields.KIND),
            label=single_string(decoded, AiOverlayEventFields.LABEL),
            confidence=single_float(decoded, AiOverlayEventFields.CONFIDENCE),
            points=tuple(
                OverlayPointPayload.from_protobuf_wire(point)
                for point in decoded.bytes_values(AiOverlayEventFields.POINT)
            ),
            latitude=single_float(geo_anchor, GeoPointFields.LATITUDE) if geo_anchor else 0,
            longitude=single_float(geo_anchor, GeoPointFields.LONGITUDE) if geo_anchor else 0,
            altitude_m=single_float(geo_anchor, GeoPointFields.ALTITUDE_M) if geo_anchor else 0,
            observed_unix_millis=single_int(time_message, TimestampedFields.OBSERVED_UNIX_MILLIS),
            received_unix_millis=single_int(time_message, TimestampedFields.RECEIVED_UNIX_MILLIS),
        )

    def to_dashboard_detection(self, *, risk_score: float) -> dict[str, object]:
        bbox = bounding_box_from_points(self.points)
        return {
            "label": self.label,
            "bbox": bbox,
            "confidence": self.confidence,
            "riskScore": risk_score,
            "trackId": self.event_id,
        }


def events_from_dashboard_response(
    response: AIEndpointResponse,
    *,
    model_id: str = DEFAULT_AI_MODEL_ID,
) -> tuple[AiOverlayEventPayload, ...]:
    observed_millis = unix_millis(response.frame.captured_at)
    received_millis = unix_millis(response.generated_at)
    return tuple(
        AiOverlayEventPayload.create(
            stream_id=response.stream_id,
            label=detection.label,
            confidence=detection.confidence,
            points=points_from_bbox(
                detection.bbox.x,
                detection.bbox.y,
                detection.bbox.width,
                detection.bbox.height,
            ),
            model_id=model_id,
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
    events: tuple[AiOverlayEventPayload, ...],
    risk_score: float,
    report_text: str = DEFAULT_AI_REPORT_TEXT,
) -> AIEndpointResponse:
    if any(event.stream_id != stream_id for event in events):
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


def points_from_bbox(x: float, y: float, width: float, height: float) -> tuple[OverlayPointPayload, ...]:
    return (
        OverlayPointPayload(x=x, y=y),
        OverlayPointPayload(x=x + width, y=y),
        OverlayPointPayload(x=x + width, y=y + height),
        OverlayPointPayload(x=x, y=y + height),
    )


def bounding_box_from_points(points: tuple[OverlayPointPayload, ...]) -> dict[str, float]:
    if len(points) < 2:
        raise ValueError("overlay bounding box requires at least two points")
    xs = [point.x for point in points]
    ys = [point.y for point in points]
    min_x = min(xs)
    min_y = min(ys)
    max_x = max(xs)
    max_y = max(ys)
    width = max_x - min_x
    height = max_y - min_y
    if min_x < 0 or min_y < 0 or max_x > 1 or max_y > 1 or width <= 0 or height <= 0:
        raise ValueError("overlay points must form a normalized non-empty frame bbox")
    return {
        "x": round(min_x, 6),
        "y": round(min_y, 6),
        "width": round(width, 6),
        "height": round(height, 6),
    }


def optional_message(decoded: DecodedWireMessage, field_number: int) -> DecodedWireMessage | None:
    values = decoded.bytes_values(field_number)
    if not values:
        return None
    if len(values) != 1:
        raise ValueError(f"field {field_number} must contain at most one message")
    return decode_message(values[0])


def unix_millis(value: datetime) -> int:
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return int(value.timestamp() * 1000)
