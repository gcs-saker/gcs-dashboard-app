from __future__ import annotations

from dataclasses import dataclass
import struct
from typing import Any


class WireTypes:
    VARINT = 0
    FIXED64 = 1
    LENGTH_DELIMITED = 2


@dataclass(frozen=True)
class DecodedWireMessage:
    fields: dict[int, list[Any]]

    def strings(self, field_number: int) -> list[str]:
        values: list[str] = []
        for value in self.fields.get(field_number, []):
            if isinstance(value, bytes):
                values.append(value.decode("utf-8"))
        return values

    def bytes_values(self, field_number: int) -> list[bytes]:
        return [value for value in self.fields.get(field_number, []) if isinstance(value, bytes)]


def encode_string(payload: bytearray, field_number: int, value: str) -> None:
    encoded = value.encode("utf-8")
    encode_varint(payload, (field_number << 3) | WireTypes.LENGTH_DELIMITED)
    encode_varint(payload, len(encoded))
    payload.extend(encoded)


def encode_bytes(payload: bytearray, field_number: int, value: bytes) -> None:
    encode_varint(payload, (field_number << 3) | WireTypes.LENGTH_DELIMITED)
    encode_varint(payload, len(value))
    payload.extend(value)


def encode_double(payload: bytearray, field_number: int, value: float) -> None:
    encode_varint(payload, (field_number << 3) | WireTypes.FIXED64)
    payload.extend(struct.pack("<d", value))


def encode_varint_field(payload: bytearray, field_number: int, value: int) -> None:
    encode_varint(payload, (field_number << 3) | WireTypes.VARINT)
    encode_varint(payload, value)


def encode_varint(payload: bytearray, value: int) -> None:
    while value > 0x7F:
        payload.append((value & 0x7F) | 0x80)
        value >>= 7
    payload.append(value)


def decode_message(payload: bytes) -> DecodedWireMessage:
    cursor = 0
    decoded: dict[int, list[Any]] = {}
    while cursor < len(payload):
        key, cursor = decode_varint(payload, cursor)
        field_number = key >> 3
        wire_type = key & 0b111
        value: Any
        if wire_type == WireTypes.VARINT:
            value, cursor = decode_varint(payload, cursor)
        elif wire_type == WireTypes.FIXED64:
            value = struct.unpack("<d", payload[cursor : cursor + 8])[0]
            cursor += 8
        elif wire_type == WireTypes.LENGTH_DELIMITED:
            length, cursor = decode_varint(payload, cursor)
            raw = payload[cursor : cursor + length]
            cursor += length
            value = bytes(raw)
        else:
            raise ValueError(f"unsupported wire type: {wire_type}")
        decoded.setdefault(field_number, []).append(value)
    return DecodedWireMessage(decoded)


def decode_varint(payload: bytes, cursor: int) -> tuple[int, int]:
    shift = 0
    result = 0
    while True:
        byte = payload[cursor]
        cursor += 1
        result |= (byte & 0x7F) << shift
        if not byte & 0x80:
            return result, cursor
        shift += 7
