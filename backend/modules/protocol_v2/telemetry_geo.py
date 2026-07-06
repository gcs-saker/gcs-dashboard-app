from modules.protocol_v2.telemetry_contract import GeoPointFields
from modules.protocol_v2.wire import encode_double


def geo_point_wire(latitude: float, longitude: float, altitude_m: float) -> bytes:
    payload = bytearray()
    encode_double(payload, GeoPointFields.LATITUDE, latitude)
    encode_double(payload, GeoPointFields.LONGITUDE, longitude)
    encode_double(payload, GeoPointFields.ALTITUDE_M, altitude_m)
    return bytes(payload)


def legacy_epoch_seconds(unix_millis: int) -> int:
    return int(unix_millis / 1000) % 86_400
