"""Compatibility names derived from the canonical generated protobuf contract."""
# mypy: disable-error-code="attr-defined"

from enum import IntEnum

from gcs.saker.v1 import gateway_service_pb2


def _field(message_type, name: str) -> int:
    return message_type.DESCRIPTOR.fields_by_name[name].number


class GatewayAckStatus(IntEnum):
    UNSPECIFIED = gateway_service_pb2.GATEWAY_ACK_STATUS_UNSPECIFIED
    ACCEPTED = gateway_service_pb2.GATEWAY_ACK_STATUS_ACCEPTED
    REJECTED = gateway_service_pb2.GATEWAY_ACK_STATUS_REJECTED
    BACKPRESSURE = gateway_service_pb2.GATEWAY_ACK_STATUS_BACKPRESSURE
    RECONNECT = gateway_service_pb2.GATEWAY_ACK_STATUS_RECONNECT


class GatewayPayloadKind:
    TELEMETRY = "telemetry"
    STREAM_EVENT = "stream_event"
    COMMAND_ACK = "command_ack"
    COMMAND = "command"
    TELEMETRY_BATCH = "telemetry_batch"


class GatewayStreamRequestFields:
    REQUEST_ID = _field(gateway_service_pb2.GatewayStreamRequest, "request_id")
    ORG_ID = _field(gateway_service_pb2.GatewayStreamRequest, "org_id")
    GROUP_ID = _field(gateway_service_pb2.GatewayStreamRequest, "group_id")
    ASSET_ID = _field(gateway_service_pb2.GatewayStreamRequest, "asset_id")
    TELEMETRY = _field(gateway_service_pb2.GatewayStreamRequest, "telemetry")
    STREAM_EVENT = _field(gateway_service_pb2.GatewayStreamRequest, "stream_event")
    COMMAND_ACK = _field(gateway_service_pb2.GatewayStreamRequest, "command_ack")


class GatewayStreamResponseFields:
    RESPONSE_ID = _field(gateway_service_pb2.GatewayStreamResponse, "response_id")
    REQUEST_ID = _field(gateway_service_pb2.GatewayStreamResponse, "request_id")
    STATUS = _field(gateway_service_pb2.GatewayStreamResponse, "status")
    REASON_CODE = _field(gateway_service_pb2.GatewayStreamResponse, "reason_code")
    COMMAND = _field(gateway_service_pb2.GatewayStreamResponse, "command")
    TELEMETRY_BATCH = _field(gateway_service_pb2.GatewayStreamResponse, "telemetry_batch")


REQUEST_PAYLOAD_FIELDS = {
    GatewayPayloadKind.TELEMETRY: GatewayStreamRequestFields.TELEMETRY,
    GatewayPayloadKind.STREAM_EVENT: GatewayStreamRequestFields.STREAM_EVENT,
    GatewayPayloadKind.COMMAND_ACK: GatewayStreamRequestFields.COMMAND_ACK,
}

RESPONSE_PAYLOAD_FIELDS = {
    GatewayPayloadKind.COMMAND: GatewayStreamResponseFields.COMMAND,
    GatewayPayloadKind.TELEMETRY_BATCH: GatewayStreamResponseFields.TELEMETRY_BATCH,
}
