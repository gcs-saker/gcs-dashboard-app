from __future__ import annotations

from datetime import datetime, timezone

from modules.protocol_v2.wire import DecodedWireMessage, decode_message
from modules.protocol_v2.wire import encode_varint_field


class TimestampedFields:
    OBSERVED_UNIX_MILLIS = 1
    RECEIVED_UNIX_MILLIS = 2


def optional_message(decoded: DecodedWireMessage, field_number: int) -> DecodedWireMessage | None:
    values = decoded.bytes_values(field_number)
    if not values:
        return None
    if len(values) != 1:
        raise ValueError(f"field {field_number} must contain at most one message")
    return decode_message(values[0])


def single_message(decoded: DecodedWireMessage, field_number: int) -> DecodedWireMessage:
    values = decoded.bytes_values(field_number)
    if len(values) != 1:
        raise ValueError(f"field {field_number} must contain exactly one message")
    return decode_message(values[0])


def single_string(decoded: DecodedWireMessage, field_number: int) -> str:
    values = decoded.strings(field_number)
    if len(values) != 1:
        raise ValueError(f"field {field_number} must contain exactly one string")
    return values[0]


def optional_string(decoded: DecodedWireMessage, field_number: int) -> str:
    values = decoded.strings(field_number)
    if not values:
        return ""
    if len(values) != 1:
        raise ValueError(f"field {field_number} must contain at most one string")
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


def single_bytes(decoded: DecodedWireMessage, field_number: int) -> bytes:
    values = decoded.bytes_values(field_number)
    if len(values) != 1:
        raise ValueError(f"field {field_number} must contain exactly one bytes value")
    return values[0]


def single_optional_bytes(decoded: DecodedWireMessage, field_number: int) -> bytes:
    values = decoded.bytes_values(field_number)
    if not values:
        return b""
    if len(values) != 1:
        raise ValueError(f"field {field_number} must contain at most one bytes value")
    return values[0]


def timestamped_wire(observed_unix_millis: int, received_unix_millis: int) -> bytes:
    payload = bytearray()
    encode_varint_field(payload, TimestampedFields.OBSERVED_UNIX_MILLIS, observed_unix_millis)
    encode_varint_field(payload, TimestampedFields.RECEIVED_UNIX_MILLIS, received_unix_millis)
    return bytes(payload)


def unix_millis(value: datetime) -> int:
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return int(value.timestamp() * 1000)
