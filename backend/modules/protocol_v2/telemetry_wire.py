from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from modules.protocol_v2.telemetry_contract import GeoPointFields, TelemetryEnvelopeFields, Vector3Fields
from modules.protocol_v2.telemetry_geo import geo_point_wire
from modules.protocol_v2.wire import (
    DecodedWireMessage,
    decode_message,
    encode_bytes,
    encode_double,
    encode_string,
    encode_varint_field,
)
from modules.protocol_v2.wire_helpers import (
    TimestampedFields,
    optional_message,
    single_float,
    single_int,
    single_message,
    single_string,
    timestamped_wire,
)


class TelemetryWireSource(Protocol):
    @property
    def event_id(self) -> str: ...

    @property
    def org_id(self) -> str: ...

    @property
    def group_id(self) -> str: ...

    @property
    def asset_id(self) -> str: ...

    @property
    def asset_kind(self) -> int: ...

    @property
    def observed_unix_millis(self) -> int: ...

    @property
    def received_unix_millis(self) -> int: ...

    @property
    def latitude(self) -> float: ...

    @property
    def longitude(self) -> float: ...

    @property
    def altitude_m(self) -> float: ...

    @property
    def heading_deg(self) -> float: ...

    @property
    def speed_mps(self) -> float: ...

    @property
    def battery_percent(self) -> float: ...

    @property
    def health(self) -> int: ...

    @property
    def active_stream_ids(self) -> tuple[str, ...]: ...

    @property
    def roll_deg(self) -> float: ...

    @property
    def pitch_deg(self) -> float: ...

    @property
    def yaw_deg(self) -> float: ...

    @property
    def gyro_x_rad_per_sec(self) -> float: ...

    @property
    def gyro_y_rad_per_sec(self) -> float: ...

    @property
    def gyro_z_rad_per_sec(self) -> float: ...

    @property
    def accel_x_mps2(self) -> float: ...

    @property
    def accel_y_mps2(self) -> float: ...

    @property
    def accel_z_mps2(self) -> float: ...

    @property
    def link_quality_percent(self) -> float: ...


@dataclass(frozen=True)
class DecodedTelemetryEnvelope:
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
    active_stream_ids: tuple[str, ...]
    roll_deg: float
    pitch_deg: float
    yaw_deg: float
    gyro_x_rad_per_sec: float
    gyro_y_rad_per_sec: float
    gyro_z_rad_per_sec: float
    accel_x_mps2: float
    accel_y_mps2: float
    accel_z_mps2: float
    link_quality_percent: float


def vector3_wire(x: float, y: float, z: float) -> bytes:
    payload = bytearray()
    encode_double(payload, Vector3Fields.X, x)
    encode_double(payload, Vector3Fields.Y, y)
    encode_double(payload, Vector3Fields.Z, z)
    return bytes(payload)


def optional_vector3(decoded: DecodedWireMessage, field_number: int) -> tuple[float, float, float]:
    message = optional_message(decoded, field_number)
    if message is None:
        return (0, 0, 0)
    return (
        single_float(message, Vector3Fields.X),
        single_float(message, Vector3Fields.Y),
        single_float(message, Vector3Fields.Z),
    )


def optional_float(decoded: DecodedWireMessage, field_number: int) -> float:
    values = decoded.fields.get(field_number, [])
    if not values:
        return 0
    return single_float(decoded, field_number)


def encode_telemetry_envelope(source: TelemetryWireSource) -> bytes:
    payload = bytearray()
    encode_string(payload, TelemetryEnvelopeFields.EVENT_ID, source.event_id)
    encode_string(payload, TelemetryEnvelopeFields.ORG_ID, source.org_id)
    encode_string(payload, TelemetryEnvelopeFields.GROUP_ID, source.group_id)
    encode_string(payload, TelemetryEnvelopeFields.ASSET_ID, source.asset_id)
    encode_varint_field(payload, TelemetryEnvelopeFields.ASSET_KIND, source.asset_kind)
    encode_bytes(
        payload,
        TelemetryEnvelopeFields.TIME,
        timestamped_wire(source.observed_unix_millis, source.received_unix_millis),
    )
    encode_bytes(
        payload, TelemetryEnvelopeFields.POSITION, geo_point_wire(source.latitude, source.longitude, source.altitude_m)
    )
    encode_double(payload, TelemetryEnvelopeFields.HEADING_DEG, source.heading_deg)
    encode_double(payload, TelemetryEnvelopeFields.SPEED_MPS, source.speed_mps)
    encode_double(payload, TelemetryEnvelopeFields.BATTERY_PERCENT, source.battery_percent)
    encode_varint_field(payload, TelemetryEnvelopeFields.HEALTH, source.health)
    for stream_id in source.active_stream_ids:
        encode_string(payload, TelemetryEnvelopeFields.ACTIVE_STREAM_ID, stream_id)
    encode_bytes(
        payload,
        TelemetryEnvelopeFields.ATTITUDE_DEG,
        vector3_wire(source.roll_deg, source.pitch_deg, source.yaw_deg),
    )
    encode_bytes(
        payload,
        TelemetryEnvelopeFields.GYRO_RAD_PER_SEC,
        vector3_wire(source.gyro_x_rad_per_sec, source.gyro_y_rad_per_sec, source.gyro_z_rad_per_sec),
    )
    encode_bytes(
        payload,
        TelemetryEnvelopeFields.ACCEL_MPS2,
        vector3_wire(source.accel_x_mps2, source.accel_y_mps2, source.accel_z_mps2),
    )
    encode_double(payload, TelemetryEnvelopeFields.LINK_QUALITY_PERCENT, source.link_quality_percent)
    return bytes(payload)


def decode_telemetry_envelope(payload: bytes) -> DecodedTelemetryEnvelope:
    decoded = decode_message(payload)
    time_message = single_message(decoded, TelemetryEnvelopeFields.TIME)
    position_message = single_message(decoded, TelemetryEnvelopeFields.POSITION)
    attitude = optional_vector3(decoded, TelemetryEnvelopeFields.ATTITUDE_DEG)
    gyro = optional_vector3(decoded, TelemetryEnvelopeFields.GYRO_RAD_PER_SEC)
    accel = optional_vector3(decoded, TelemetryEnvelopeFields.ACCEL_MPS2)
    return DecodedTelemetryEnvelope(
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
        roll_deg=attitude[0],
        pitch_deg=attitude[1],
        yaw_deg=attitude[2],
        gyro_x_rad_per_sec=gyro[0],
        gyro_y_rad_per_sec=gyro[1],
        gyro_z_rad_per_sec=gyro[2],
        accel_x_mps2=accel[0],
        accel_y_mps2=accel[1],
        accel_z_mps2=accel[2],
        link_quality_percent=optional_float(decoded, TelemetryEnvelopeFields.LINK_QUALITY_PERCENT),
    )
