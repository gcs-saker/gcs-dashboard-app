from __future__ import annotations

from enum import IntEnum


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


REQUEST_PAYLOAD_FIELDS = {
    GatewayPayloadKind.TELEMETRY: GatewayStreamRequestFields.TELEMETRY,
    GatewayPayloadKind.STREAM_EVENT: GatewayStreamRequestFields.STREAM_EVENT,
    GatewayPayloadKind.COMMAND_ACK: GatewayStreamRequestFields.COMMAND_ACK,
}

RESPONSE_PAYLOAD_FIELDS = {
    GatewayPayloadKind.COMMAND: GatewayStreamResponseFields.COMMAND,
    GatewayPayloadKind.TELEMETRY_BATCH: GatewayStreamResponseFields.TELEMETRY_BATCH,
}
