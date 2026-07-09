from __future__ import annotations

from dataclasses import dataclass
from time import time
from uuid import uuid4

from modules.protocol_v2.wire import decode_message, encode_bytes, encode_string
from modules.protocol_v2.wire_helpers import (
    TimestampedFields,
    single_int,
    single_message,
    single_optional_bytes,
    single_string,
    timestamped_wire,
)


class StreamCommandFields:
    COMMAND_ID = 1
    STREAM_ID = 2
    TARGET_ASSET_ID = 3
    COMMAND_TYPE = 4
    PAYLOAD = 5
    TIME = 6


@dataclass(frozen=True)
class StreamCommandPayload:
    command_id: str
    stream_id: str
    target_asset_id: str
    command_type: str
    observed_unix_millis: int
    payload: bytes = b""

    @classmethod
    def create(
        cls,
        *,
        stream_id: str,
        target_asset_id: str,
        command_type: str,
        observed_unix_millis: int | None = None,
    ) -> "StreamCommandPayload":
        return cls(
            command_id=str(uuid4()),
            stream_id=stream_id,
            target_asset_id=target_asset_id,
            command_type=command_type,
            observed_unix_millis=observed_unix_millis or int(time() * 1000),
        )

    def to_protobuf_wire(self) -> bytes:
        payload = bytearray()
        encode_string(payload, StreamCommandFields.COMMAND_ID, self.command_id)
        encode_string(payload, StreamCommandFields.STREAM_ID, self.stream_id)
        encode_string(payload, StreamCommandFields.TARGET_ASSET_ID, self.target_asset_id)
        encode_string(payload, StreamCommandFields.COMMAND_TYPE, self.command_type)
        if self.payload:
            encode_bytes(payload, StreamCommandFields.PAYLOAD, self.payload)
        encode_bytes(
            payload, StreamCommandFields.TIME, timestamped_wire(self.observed_unix_millis, self.observed_unix_millis)
        )
        return bytes(payload)

    @classmethod
    def from_protobuf_wire(cls, payload: bytes) -> "StreamCommandPayload":
        decoded = decode_message(payload)
        time_message = single_message(decoded, StreamCommandFields.TIME)
        return cls(
            command_id=single_string(decoded, StreamCommandFields.COMMAND_ID),
            stream_id=single_string(decoded, StreamCommandFields.STREAM_ID),
            target_asset_id=single_string(decoded, StreamCommandFields.TARGET_ASSET_ID),
            command_type=single_string(decoded, StreamCommandFields.COMMAND_TYPE),
            observed_unix_millis=single_int(time_message, TimestampedFields.OBSERVED_UNIX_MILLIS),
            payload=single_optional_bytes(decoded, StreamCommandFields.PAYLOAD),
        )
