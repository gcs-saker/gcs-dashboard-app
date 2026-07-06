from __future__ import annotations

from dataclasses import dataclass

from modules.protocol_v2.gateway_service_contract import (
    GatewayAckStatus,
    GatewayPayloadKind,
    GatewayStreamRequestFields,
    GatewayStreamResponseFields,
)
from modules.protocol_v2.gateway_service_payloads import (
    GatewayStreamRequestPayload,
    request_payload_field,
    request_payload_field_and_kind,
    response_payload,
    response_payload_field,
)
from modules.protocol_v2.wire import decode_message, encode_bytes, encode_string, encode_varint_field
from modules.protocol_v2.wire_helpers import optional_string, single_bytes, single_int, single_string


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
