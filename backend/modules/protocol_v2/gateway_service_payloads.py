from __future__ import annotations

from dataclasses import dataclass

from modules.protocol_v2.gateway_service_contract import (
    REQUEST_PAYLOAD_FIELDS,
    RESPONSE_PAYLOAD_FIELDS,
    GatewayPayloadKind,
    GatewayStreamResponseFields,
)
from modules.protocol_v2.wire import DecodedWireMessage


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


def request_payload_field(kind: str) -> int:
    try:
        return REQUEST_PAYLOAD_FIELDS[kind]
    except KeyError as exc:
        raise ValueError(f"unsupported gateway request payload kind: {kind}") from exc


def response_payload_field(kind: str) -> int:
    try:
        return RESPONSE_PAYLOAD_FIELDS[kind]
    except KeyError as exc:
        raise ValueError(f"unsupported gateway response payload kind: {kind}") from exc


def request_payload_field_and_kind(decoded: DecodedWireMessage) -> tuple[int, str]:
    present = [(field, kind) for kind, field in REQUEST_PAYLOAD_FIELDS.items() if decoded.bytes_values(field)]
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
