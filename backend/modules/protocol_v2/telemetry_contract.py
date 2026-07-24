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
    ATTITUDE_DEG = 13
    GYRO_RAD_PER_SEC = 14
    ACCEL_MPS2 = 15
    LINK_QUALITY_PERCENT = 16


class GeoPointFields:
    LATITUDE = 1
    LONGITUDE = 2
    ALTITUDE_M = 3


class Vector3Fields:
    X = 1
    Y = 2
    Z = 3


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
