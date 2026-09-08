from modules.protocol_v2.telemetry_contract import GeoPointFields, TelemetryEnvelopeFields
from modules.protocol_v2.telemetry_wire.models import DecodedTelemetryEnvelope
from modules.protocol_v2.telemetry_wire.vector import decode_optional_vector3
from modules.protocol_v2.wire import DecodedWireMessage, decode_message
from modules.protocol_v2.wire_helpers import TimestampedFields, single_float, single_int, single_message, single_string


def _optional_float(decoded: DecodedWireMessage, field_number: int) -> float:
    return single_float(decoded, field_number) if decoded.fields.get(field_number) else 0


def decode_telemetry_envelope(payload: bytes) -> DecodedTelemetryEnvelope:
    decoded = decode_message(payload)
    time_message = single_message(decoded, TelemetryEnvelopeFields.TIME)
    position_message = single_message(decoded, TelemetryEnvelopeFields.POSITION)
    attitude = decode_optional_vector3(decoded, TelemetryEnvelopeFields.ATTITUDE_DEG)
    gyro = decode_optional_vector3(decoded, TelemetryEnvelopeFields.GYRO_RAD_PER_SEC)
    accel = decode_optional_vector3(decoded, TelemetryEnvelopeFields.ACCEL_MPS2)
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
        link_quality_percent=_optional_float(decoded, TelemetryEnvelopeFields.LINK_QUALITY_PERCENT),
    )
