from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from modules.protocol_v2.ai_overlay_contract import AiOverlayEventFields
from modules.protocol_v2.ai_overlay_points import OverlayPointPayload
from modules.protocol_v2.telemetry_contract import GeoPointFields
from modules.protocol_v2.telemetry_geo import geo_point_wire
from modules.protocol_v2.wire import decode_message, encode_bytes, encode_double, encode_string, encode_varint_field
from modules.protocol_v2.wire_helpers import (
    TimestampedFields,
    optional_message,
    single_float,
    single_int,
    single_message,
    single_string,
    timestamped_wire,
)


class AiOverlayWireSource(Protocol):
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


@dataclass(frozen=True)
class DecodedAiOverlayEvent:
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


def encode_overlay_event(source: AiOverlayWireSource) -> bytes:
    payload = bytearray()
    encode_string(payload, AiOverlayEventFields.EVENT_ID, source.event_id)
    encode_string(payload, AiOverlayEventFields.STREAM_ID, source.stream_id)
    encode_string(payload, AiOverlayEventFields.MODEL_ID, source.model_id)
    encode_varint_field(payload, AiOverlayEventFields.KIND, source.kind)
    encode_string(payload, AiOverlayEventFields.LABEL, source.label)
    encode_double(payload, AiOverlayEventFields.CONFIDENCE, source.confidence)
    for point in source.points:
        encode_bytes(payload, AiOverlayEventFields.POINT, point.to_protobuf_wire())
    encode_bytes(payload, AiOverlayEventFields.GEO_ANCHOR, geo_point_wire(source.latitude, source.longitude, source.altitude_m))
    encode_bytes(payload, AiOverlayEventFields.TIME, timestamped_wire(source.observed_unix_millis, source.received_unix_millis))
    return bytes(payload)


def decode_overlay_event(payload: bytes) -> DecodedAiOverlayEvent:
    decoded = decode_message(payload)
    geo_anchor = optional_message(decoded, AiOverlayEventFields.GEO_ANCHOR)
    time_message = single_message(decoded, AiOverlayEventFields.TIME)
    return DecodedAiOverlayEvent(
        event_id=single_string(decoded, AiOverlayEventFields.EVENT_ID),
        stream_id=single_string(decoded, AiOverlayEventFields.STREAM_ID),
        model_id=single_string(decoded, AiOverlayEventFields.MODEL_ID),
        kind=single_int(decoded, AiOverlayEventFields.KIND),
        label=single_string(decoded, AiOverlayEventFields.LABEL),
        confidence=single_float(decoded, AiOverlayEventFields.CONFIDENCE),
        points=tuple(OverlayPointPayload.from_protobuf_wire(point) for point in decoded.bytes_values(AiOverlayEventFields.POINT)),
        latitude=single_float(geo_anchor, GeoPointFields.LATITUDE) if geo_anchor else 0,
        longitude=single_float(geo_anchor, GeoPointFields.LONGITUDE) if geo_anchor else 0,
        altitude_m=single_float(geo_anchor, GeoPointFields.ALTITUDE_M) if geo_anchor else 0,
        observed_unix_millis=single_int(time_message, TimestampedFields.OBSERVED_UNIX_MILLIS),
        received_unix_millis=single_int(time_message, TimestampedFields.RECEIVED_UNIX_MILLIS),
    )
