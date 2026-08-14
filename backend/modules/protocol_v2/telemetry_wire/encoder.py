from modules.protocol_v2.telemetry_contract import TelemetryEnvelopeFields
from modules.protocol_v2.telemetry_geo import geo_point_wire
from modules.protocol_v2.telemetry_wire.models import TelemetryWireSource
from modules.protocol_v2.telemetry_wire.vector import encode_vector3
from modules.protocol_v2.wire import encode_bytes, encode_double, encode_string, encode_varint_field
from modules.protocol_v2.wire_helpers import timestamped_wire


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
        payload,
        TelemetryEnvelopeFields.POSITION,
        geo_point_wire(source.latitude, source.longitude, source.altitude_m),
    )
    encode_double(payload, TelemetryEnvelopeFields.HEADING_DEG, source.heading_deg)
    encode_double(payload, TelemetryEnvelopeFields.SPEED_MPS, source.speed_mps)
    encode_double(payload, TelemetryEnvelopeFields.BATTERY_PERCENT, source.battery_percent)
    encode_varint_field(payload, TelemetryEnvelopeFields.HEALTH, source.health)
    for stream_id in source.active_stream_ids:
        encode_string(payload, TelemetryEnvelopeFields.ACTIVE_STREAM_ID, stream_id)
    encode_bytes(
        payload, TelemetryEnvelopeFields.ATTITUDE_DEG, encode_vector3(source.roll_deg, source.pitch_deg, source.yaw_deg)
    )
    encode_bytes(
        payload,
        TelemetryEnvelopeFields.GYRO_RAD_PER_SEC,
        encode_vector3(source.gyro_x_rad_per_sec, source.gyro_y_rad_per_sec, source.gyro_z_rad_per_sec),
    )
    encode_bytes(
        payload,
        TelemetryEnvelopeFields.ACCEL_MPS2,
        encode_vector3(source.accel_x_mps2, source.accel_y_mps2, source.accel_z_mps2),
    )
    encode_double(payload, TelemetryEnvelopeFields.LINK_QUALITY_PERCENT, source.link_quality_percent)
    return bytes(payload)
