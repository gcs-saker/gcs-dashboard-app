from modules.protocol_v2.telemetry_contract import Vector3Fields
from modules.protocol_v2.wire import DecodedWireMessage, encode_double
from modules.protocol_v2.wire_helpers import optional_message, single_float


def encode_vector3(x: float, y: float, z: float) -> bytes:
    payload = bytearray()
    encode_double(payload, Vector3Fields.X, x)
    encode_double(payload, Vector3Fields.Y, y)
    encode_double(payload, Vector3Fields.Z, z)
    return bytes(payload)


def decode_optional_vector3(decoded: DecodedWireMessage, field_number: int) -> tuple[float, float, float]:
    message = optional_message(decoded, field_number)
    if message is None:
        return (0, 0, 0)
    return (
        single_float(message, Vector3Fields.X),
        single_float(message, Vector3Fields.Y),
        single_float(message, Vector3Fields.Z),
    )
