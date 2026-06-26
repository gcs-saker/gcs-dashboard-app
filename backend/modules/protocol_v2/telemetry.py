from __future__ import annotations

from dataclasses import dataclass
from time import time
from uuid import uuid4

from model.telemetry_model import TelemetryCreate
from modules.protocol_v2.wire import (
    DecodedWireMessage,
    decode_message,
    encode_bytes,
    encode_double,
    encode_string,
    encode_varint_field,
)


class TelemetryEnvelopeFields:
    EVENT_ID = 1
    ORG_ID = 2
    GROUP_ID = 3
    ASSET_ID = 4
    ASSET_KIND = 5
    TIME = 6
    POSITION = 7
    HEADING_DEG = 8
    SPEED_MPS = 9
    BATTERY_PERCENT = 10
    HEALTH = 11
    ACTIVE_STREAM_ID = 12


class TimestampedFields:
    OBSERVED_UNIX_MILLIS = 1
    RECEIVED_UNIX_MILLIS = 2


class GeoPointFields:
    LATITUDE = 1
    LONGITUDE = 2
    ALTITUDE_M = 3


class AssetKinds:
    UNSPECIFIED = 0
    DRONE = 1
    GROUND_ROBOT = 2
    FIXED_CAMERA = 3
    OPERATOR_DEVICE = 4


class HealthStates:
    UNSPECIFIED = 0
    OK = 1
    WARN = 2
    ERROR = 3
    OFFLINE = 4


@dataclass(frozen=True)
class TelemetryEnvelopePayload:
    event_id: str
    org_id: str
    group_id: str
    asset_id: str
    asset_kind: int
    observed_unix_millis: int
    received_unix_millis: int
    latitude: float
    longitude: float
    altitude_m: float
    heading_deg: float
    speed_mps: float
    battery_percent: float
    health: int
    active_stream_ids: tuple[str, ...] = ()

    @classmethod
    def create(
        cls,
        *,
        org_id: str,
        group_id: str,
        asset_id: str,
        latitude: float,
        longitude: float,
        altitude_m: float = 0,
        heading_deg: float = 0,
        speed_mps: float = 0,
        battery_percent: float = 0,
        asset_kind: int = AssetKinds.OPERATOR_DEVICE,
        health: int = HealthStates.OK,
        active_stream_ids: tuple[str, ...] = (),
        observed_unix_millis: int | None = None,
        received_unix_millis: int | None = None,
    ) -> "TelemetryEnvelopePayload":
        now = int(time() * 1000)
        return cls(
            event_id=str(uuid4()),
            org_id=org_id,
            group_id=group_id,
            asset_id=asset_id,
            asset_kind=asset_kind,
            observed_unix_millis=observed_unix_millis or now,
            received_unix_millis=received_unix_millis or now,
            latitude=latitude,
            longitude=longitude,
            altitude_m=altitude_m,
            heading_deg=heading_deg,
            speed_mps=speed_mps,
            battery_percent=battery_percent,
            health=health,
            active_stream_ids=active_stream_ids,
        )

    def to_protobuf_wire(self) -> bytes:
        payload = bytearray()
        encode_string(payload, TelemetryEnvelopeFields.EVENT_ID, self.event_id)
        encode_string(payload, TelemetryEnvelopeFields.ORG_ID, self.org_id)
        encode_string(payload, TelemetryEnvelopeFields.GROUP_ID, self.group_id)
        encode_string(payload, TelemetryEnvelopeFields.ASSET_ID, self.asset_id)
        encode_varint_field(payload, TelemetryEnvelopeFields.ASSET_KIND, self.asset_kind)
        encode_bytes(payload, TelemetryEnvelopeFields.TIME, timestamped_wire(self.observed_unix_millis, self.received_unix_millis))
        encode_bytes(payload, TelemetryEnvelopeFields.POSITION, geo_point_wire(self.latitude, self.longitude, self.altitude_m))
        encode_double(payload, TelemetryEnvelopeFields.HEADING_DEG, self.heading_deg)
        encode_double(payload, TelemetryEnvelopeFields.SPEED_MPS, self.speed_mps)
        encode_double(payload, TelemetryEnvelopeFields.BATTERY_PERCENT, self.battery_percent)
        encode_varint_field(payload, TelemetryEnvelopeFields.HEALTH, self.health)
        for stream_id in self.active_stream_ids:
            encode_string(payload, TelemetryEnvelopeFields.ACTIVE_STREAM_ID, stream_id)
        return bytes(payload)

    @classmethod
    def from_protobuf_wire(cls, payload: bytes) -> "TelemetryEnvelopePayload":
        decoded = decode_message(payload)
        time_message = single_message(decoded, TelemetryEnvelopeFields.TIME)
        position_message = single_message(decoded, TelemetryEnvelopeFields.POSITION)
        return cls(
            event_id=single_string(decoded, TelemetryEnvelopeFields.EVENT_ID),
            org_id=single_string(decoded, TelemetryEnvelopeFields.ORG_ID),
            group_id=single_string(decoded, TelemetryEnvelopeFields.GROUP_ID),
            asset_id=single_string(decoded, TelemetryEnvelopeFields.ASSET_ID),
            asset_kind=single_int(decoded, TelemetryEnvelopeFields.ASSET_KIND),
            observed_unix_millis=single_int(time_message, TimestampedFields.OBSERVED_UNIX_MILLIS),
            received_unix_millis=single_int(time_message, TimestampedFields.RECEIVED_UNIX_MILLIS),
            latitude=single_float(position_message, GeoPointFields.LATITUDE),
            longitude=single_float(position_message, GeoPointFields.LONGITUDE),
            altitude_m=single_float(position_message, GeoPointFields.ALTITUDE_M),
            heading_deg=single_float(decoded, TelemetryEnvelopeFields.HEADING_DEG),
            speed_mps=single_float(decoded, TelemetryEnvelopeFields.SPEED_MPS),
            battery_percent=single_float(decoded, TelemetryEnvelopeFields.BATTERY_PERCENT),
            health=single_int(decoded, TelemetryEnvelopeFields.HEALTH),
            active_stream_ids=tuple(decoded.strings(TelemetryEnvelopeFields.ACTIVE_STREAM_ID)),
        )

    def to_legacy_telemetry(self) -> TelemetryCreate:
        return TelemetryCreate(
            uuid=self.asset_id,
            latitude=self.latitude,
            longitude=self.longitude,
            altitude=self.altitude_m,
            magneticX=self.heading_deg,
            velocity=self.speed_mps,
            phoneBatterySOC=self.battery_percent,
            epochTime=legacy_epoch_seconds(self.observed_unix_millis),
        )


def single_string(decoded: DecodedWireMessage, field_number: int) -> str:
    values = decoded.strings(field_number)
    if len(values) != 1:
        raise ValueError(f"field {field_number} must contain exactly one string")
    return values[0]


def single_int(decoded: DecodedWireMessage, field_number: int) -> int:
    values = decoded.fields.get(field_number, [])
    if len(values) != 1 or not isinstance(values[0], int):
        raise ValueError(f"field {field_number} must contain exactly one integer")
    return values[0]


def single_float(decoded: DecodedWireMessage, field_number: int) -> float:
    values = decoded.fields.get(field_number, [])
    if len(values) != 1 or not isinstance(values[0], float):
        raise ValueError(f"field {field_number} must contain exactly one float")
    return values[0]


def single_message(decoded: DecodedWireMessage, field_number: int) -> DecodedWireMessage:
    values = decoded.bytes_values(field_number)
    if len(values) != 1:
        raise ValueError(f"field {field_number} must contain exactly one message")
    return decode_message(values[0])


def timestamped_wire(observed_unix_millis: int, received_unix_millis: int) -> bytes:
    payload = bytearray()
    encode_varint_field(payload, TimestampedFields.OBSERVED_UNIX_MILLIS, observed_unix_millis)
    encode_varint_field(payload, TimestampedFields.RECEIVED_UNIX_MILLIS, received_unix_millis)
    return bytes(payload)


def geo_point_wire(latitude: float, longitude: float, altitude_m: float) -> bytes:
    payload = bytearray()
    encode_double(payload, GeoPointFields.LATITUDE, latitude)
    encode_double(payload, GeoPointFields.LONGITUDE, longitude)
    encode_double(payload, GeoPointFields.ALTITUDE_M, altitude_m)
    return bytes(payload)


def legacy_epoch_seconds(unix_millis: int) -> int:
    return int(unix_millis / 1000) % 86_400
