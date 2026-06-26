from __future__ import annotations

from dataclasses import dataclass
from enum import IntEnum

from modules.protocol_v2.wire import DecodedWireMessage, decode_message, encode_bytes, encode_string, encode_varint_field


class GatewayAckStatus(IntEnum):
    UNSPECIFIED = 0
    ACCEPTED = 1
    REJECTED = 2
    BACKPRESSURE = 3
    RECONNECT = 4


class GatewayPayloadKind:
    TELEMETRY = "telemetry"
    STREAM_EVENT = "stream_event"
    COMMAND_ACK = "command_ack"
    COMMAND = "command"
    TELEMETRY_BATCH = "telemetry_batch"


class GatewayStreamRequestFields:
    REQUEST_ID = 1
    ORG_ID = 2
    GROUP_ID = 3
    ASSET_ID = 4
    TELEMETRY = 10
    STREAM_EVENT = 11
    COMMAND_ACK = 12


class GatewayStreamResponseFields:
    RESPONSE_ID = 1
    REQUEST_ID = 2
    STATUS = 3
    REASON_CODE = 4
    COMMAND = 10
    TELEMETRY_BATCH = 11


@dataclass(frozen=True)
class GatewayStreamRequestPayload:
    kind: str
    value: bytes

    @classmethod
    def telemetry(cls, value: bytes) -> "GatewayStreamRequestPayload":
        return cls(kind=GatewayPayloadKind.TELEMETRY, value=value)

    @classmethod
    def stream_event(cls, value: bytes) -> "GatewayStreamRequestPayload":
        return cls(kind=GatewayPayloadKind.STREAM_EVENT, value=value)

    @classmethod
    def command_ack(cls, value: bytes) -> "GatewayStreamRequestPayload":
        return cls(kind=GatewayPayloadKind.COMMAND_ACK, value=value)


@dataclass(frozen=True)
class GatewayStreamRequest:
    request_id: str
    org_id: str
    group_id: str
    asset_id: str
    payload: GatewayStreamRequestPayload

    def to_protobuf_wire(self) -> bytes:
        payload = bytearray()
        encode_string(payload, GatewayStreamRequestFields.REQUEST_ID, self.request_id)
        encode_string(payload, GatewayStreamRequestFields.ORG_ID, self.org_id)
        encode_string(payload, GatewayStreamRequestFields.GROUP_ID, self.group_id)
        encode_string(payload, GatewayStreamRequestFields.ASSET_ID, self.asset_id)
        encode_bytes(payload, request_payload_field(self.payload.kind), self.payload.value)
        return bytes(payload)

    @classmethod
    def from_protobuf_wire(cls, payload: bytes) -> "GatewayStreamRequest":
        decoded = decode_message(payload)
        payload_field, payload_kind = request_payload_field_and_kind(decoded)
        return cls(
            request_id=single_string(decoded, GatewayStreamRequestFields.REQUEST_ID),
            org_id=single_string(decoded, GatewayStreamRequestFields.ORG_ID),
            group_id=single_string(decoded, GatewayStreamRequestFields.GROUP_ID),
            asset_id=single_string(decoded, GatewayStreamRequestFields.ASSET_ID),
            payload=GatewayStreamRequestPayload(
                kind=payload_kind,
                value=single_bytes(decoded, payload_field),
            ),
        )


@dataclass(frozen=True)
class GatewayStreamResponse:
    response_id: str
    request_id: str
    status: GatewayAckStatus
    reason_code: str
    payload: GatewayStreamRequestPayload | None = None

    def to_protobuf_wire(self) -> bytes:
        payload = bytearray()
        encode_string(payload, GatewayStreamResponseFields.RESPONSE_ID, self.response_id)
        if self.request_id:
            encode_string(payload, GatewayStreamResponseFields.REQUEST_ID, self.request_id)
        encode_varint_field(payload, GatewayStreamResponseFields.STATUS, int(self.status))
        encode_string(payload, GatewayStreamResponseFields.REASON_CODE, self.reason_code)
        if self.payload is not None:
            encode_bytes(payload, response_payload_field(self.payload.kind), self.payload.value)
        return bytes(payload)

    @classmethod
    def from_protobuf_wire(cls, payload: bytes) -> "GatewayStreamResponse":
        decoded = decode_message(payload)
        return cls(
            response_id=single_string(decoded, GatewayStreamResponseFields.RESPONSE_ID),
            request_id=optional_string(decoded, GatewayStreamResponseFields.REQUEST_ID),
            status=GatewayAckStatus(single_int(decoded, GatewayStreamResponseFields.STATUS)),
            reason_code=single_string(decoded, GatewayStreamResponseFields.REASON_CODE),
            payload=response_payload(decoded),
        )


def request_payload_field(kind: str) -> int:
    if kind == GatewayPayloadKind.TELEMETRY:
        return GatewayStreamRequestFields.TELEMETRY
    if kind == GatewayPayloadKind.STREAM_EVENT:
        return GatewayStreamRequestFields.STREAM_EVENT
    if kind == GatewayPayloadKind.COMMAND_ACK:
        return GatewayStreamRequestFields.COMMAND_ACK
    raise ValueError(f"unsupported gateway request payload kind: {kind}")


def response_payload_field(kind: str) -> int:
    if kind == GatewayPayloadKind.COMMAND:
        return GatewayStreamResponseFields.COMMAND
    if kind == GatewayPayloadKind.TELEMETRY_BATCH:
        return GatewayStreamResponseFields.TELEMETRY_BATCH
    raise ValueError(f"unsupported gateway response payload kind: {kind}")


def request_payload_field_and_kind(decoded: DecodedWireMessage) -> tuple[int, str]:
    candidates = (
        (GatewayStreamRequestFields.TELEMETRY, GatewayPayloadKind.TELEMETRY),
        (GatewayStreamRequestFields.STREAM_EVENT, GatewayPayloadKind.STREAM_EVENT),
        (GatewayStreamRequestFields.COMMAND_ACK, GatewayPayloadKind.COMMAND_ACK),
    )
    present = [(field, kind) for field, kind in candidates if decoded.bytes_values(field)]
    if len(present) != 1:
        raise ValueError("gateway request must contain exactly one payload")
    return present[0]


def response_payload(decoded: DecodedWireMessage) -> GatewayStreamRequestPayload | None:
    command = decoded.bytes_values(GatewayStreamResponseFields.COMMAND)
    telemetry_batch = decoded.bytes_values(GatewayStreamResponseFields.TELEMETRY_BATCH)
    if command and telemetry_batch:
        raise ValueError("gateway response must contain at most one payload")
    if len(command) > 1 or len(telemetry_batch) > 1:
        raise ValueError("gateway response payload must not be repeated")
    if command:
        return GatewayStreamRequestPayload(kind=GatewayPayloadKind.COMMAND, value=command[0])
    if telemetry_batch:
        return GatewayStreamRequestPayload(kind=GatewayPayloadKind.TELEMETRY_BATCH, value=telemetry_batch[0])
    return None


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


def single_bytes(decoded: DecodedWireMessage, field_number: int) -> bytes:
    values = decoded.bytes_values(field_number)
    if len(values) != 1:
        raise ValueError(f"field {field_number} must contain exactly one bytes value")
    return values[0]
