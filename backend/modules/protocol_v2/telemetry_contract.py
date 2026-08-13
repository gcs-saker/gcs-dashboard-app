"""Compatibility names derived from the canonical generated protobuf contract."""
# mypy: disable-error-code="attr-defined"

from gcs.saker.v1 import common_pb2, telemetry_pb2


def _field(message_type, name: str) -> int:
    return message_type.DESCRIPTOR.fields_by_name[name].number


class TelemetryEnvelopeFields:
    EVENT_ID = _field(telemetry_pb2.TelemetryEnvelope, "event_id")
    ORG_ID = _field(telemetry_pb2.TelemetryEnvelope, "org_id")
    GROUP_ID = _field(telemetry_pb2.TelemetryEnvelope, "group_id")
    ASSET_ID = _field(telemetry_pb2.TelemetryEnvelope, "asset_id")
    ASSET_KIND = _field(telemetry_pb2.TelemetryEnvelope, "asset_kind")
    TIME = _field(telemetry_pb2.TelemetryEnvelope, "time")
    POSITION = _field(telemetry_pb2.TelemetryEnvelope, "position")
    HEADING_DEG = _field(telemetry_pb2.TelemetryEnvelope, "heading_deg")
    SPEED_MPS = _field(telemetry_pb2.TelemetryEnvelope, "speed_mps")
    BATTERY_PERCENT = _field(telemetry_pb2.TelemetryEnvelope, "battery_percent")
    HEALTH = _field(telemetry_pb2.TelemetryEnvelope, "health")
    ACTIVE_STREAM_ID = _field(telemetry_pb2.TelemetryEnvelope, "active_stream_ids")
    ATTITUDE_DEG = _field(telemetry_pb2.TelemetryEnvelope, "attitude_deg")
    GYRO_RAD_PER_SEC = _field(telemetry_pb2.TelemetryEnvelope, "gyro_rad_per_sec")
    ACCEL_MPS2 = _field(telemetry_pb2.TelemetryEnvelope, "accel_mps2")
    LINK_QUALITY_PERCENT = _field(telemetry_pb2.TelemetryEnvelope, "link_quality_percent")


class GeoPointFields:
    LATITUDE = _field(common_pb2.GeoPoint, "latitude")
    LONGITUDE = _field(common_pb2.GeoPoint, "longitude")
    ALTITUDE_M = _field(common_pb2.GeoPoint, "altitude_m")


class Vector3Fields:
    X = _field(common_pb2.Vector3, "x")
    Y = _field(common_pb2.Vector3, "y")
    Z = _field(common_pb2.Vector3, "z")


class AssetKinds:
    UNSPECIFIED = common_pb2.ASSET_KIND_UNSPECIFIED
    DRONE = common_pb2.ASSET_KIND_DRONE
    GROUND_ROBOT = common_pb2.ASSET_KIND_GROUND_ROBOT
    FIXED_CAMERA = common_pb2.ASSET_KIND_FIXED_CAMERA
    OPERATOR_DEVICE = common_pb2.ASSET_KIND_OPERATOR_DEVICE


class HealthStates:
    UNSPECIFIED = common_pb2.HEALTH_STATE_UNSPECIFIED
    OK = common_pb2.HEALTH_STATE_OK
    WARN = common_pb2.HEALTH_STATE_WARN
    ERROR = common_pb2.HEALTH_STATE_ERROR
    OFFLINE = common_pb2.HEALTH_STATE_OFFLINE
