from __future__ import annotations

from dataclasses import dataclass
from time import time
from uuid import uuid4

from model.telemetry_model import TelemetryCreate
from modules.protocol_v2.wire import DecodedWireMessage, decode_message, encode_double, encode_string, encode_varint_field


class TelemetryEnvelopeFields:
    EVENT_ID = 1
    ORG_ID = 2
    GROUP_ID = 3
    ASSET_ID = 4
    ASSET_KIND = 5
    OBSERVED_UNIX_MILLIS = 6
    RECEIVED_UNIX_MILLIS = 7
    LATITUDE = 8
    LONGITUDE = 9
    ALTITUDE_M = 10
    HEADING_DEG = 11
    SPEED_MPS = 12
    BATTERY_PERCENT = 13
    HEALTH = 14
    ACTIVE_STREAM_ID = 15


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
        encode_varint_field(payload, TelemetryEnvelopeFields.OBSERVED_UNIX_MILLIS, self.observed_unix_millis)
        encode_varint_field(payload, TelemetryEnvelopeFields.RECEIVED_UNIX_MILLIS, self.received_unix_millis)
        encode_double(payload, TelemetryEnvelopeFields.LATITUDE, self.latitude)
        encode_double(payload, TelemetryEnvelopeFields.LONGITUDE, self.longitude)
        encode_double(payload, TelemetryEnvelopeFields.ALTITUDE_M, self.altitude_m)
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
        return cls(
            event_id=single_string(decoded, TelemetryEnvelopeFields.EVENT_ID),
            org_id=single_string(decoded, TelemetryEnvelopeFields.ORG_ID),
            group_id=single_string(decoded, TelemetryEnvelopeFields.GROUP_ID),
            asset_id=single_string(decoded, TelemetryEnvelopeFields.ASSET_ID),
            asset_kind=single_int(decoded, TelemetryEnvelopeFields.ASSET_KIND),
            observed_unix_millis=single_int(decoded, TelemetryEnvelopeFields.OBSERVED_UNIX_MILLIS),
            received_unix_millis=single_int(decoded, TelemetryEnvelopeFields.RECEIVED_UNIX_MILLIS),
            latitude=single_float(decoded, TelemetryEnvelopeFields.LATITUDE),
            longitude=single_float(decoded, TelemetryEnvelopeFields.LONGITUDE),
            altitude_m=single_float(decoded, TelemetryEnvelopeFields.ALTITUDE_M),
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


def legacy_epoch_seconds(unix_millis: int) -> int:
    return int(unix_millis / 1000) % 86_400
