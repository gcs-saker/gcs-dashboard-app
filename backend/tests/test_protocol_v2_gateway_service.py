from __future__ import annotations

import pytest

from modules.protocol_v2.gateway_service import (
    GatewayAckStatus,
    GatewayPayloadKind,
    GatewayStreamRequest,
    GatewayStreamRequestFields,
    GatewayStreamRequestPayload,
    GatewayStreamResponse,
)
from modules.protocol_v2.telemetry import AssetKinds, HealthStates, TelemetryEnvelopePayload
from modules.protocol_v2.wire import encode_bytes, encode_string


def test_gateway_stream_request_wraps_telemetry_contract_payload() -> None:
    telemetry = TelemetryEnvelopePayload.create(
        org_id="a4ai",
        group_id="co-a",
        asset_id="raw.mobile.front",
        asset_kind=AssetKinds.OPERATOR_DEVICE,
        latitude=35.871435,
        longitude=128.601445,
        health=HealthStates.OK,
        observed_unix_millis=1_781_721_600_000,
        received_unix_millis=1_781_721_600_042,
    )
    request = GatewayStreamRequest(
        request_id="req-001",
        org_id="a4ai",
        group_id="co-a",
        asset_id="raw.mobile.front",
        payload=GatewayStreamRequestPayload.telemetry(telemetry.to_protobuf_wire()),
    )

    decoded = GatewayStreamRequest.from_protobuf_wire(request.to_protobuf_wire())

    assert decoded == request
    assert decoded.payload.kind == GatewayPayloadKind.TELEMETRY
    assert TelemetryEnvelopePayload.from_protobuf_wire(decoded.payload.value) == telemetry


def test_gateway_stream_request_rejects_missing_or_repeated_payload() -> None:
    wire_without_payload = bytearray()
    encode_string(wire_without_payload, GatewayStreamRequestFields.REQUEST_ID, "req-001")
    encode_string(wire_without_payload, GatewayStreamRequestFields.ORG_ID, "a4ai")
    encode_string(wire_without_payload, GatewayStreamRequestFields.GROUP_ID, "co-a")
    encode_string(wire_without_payload, GatewayStreamRequestFields.ASSET_ID, "raw.mobile.front")

    wire_with_repeated_payload = bytearray(wire_without_payload)
    encode_bytes(wire_with_repeated_payload, GatewayStreamRequestFields.TELEMETRY, b"telemetry")
    encode_bytes(wire_with_repeated_payload, GatewayStreamRequestFields.STREAM_EVENT, b"stream")

    with pytest.raises(ValueError, match="exactly one payload"):
        GatewayStreamRequest.from_protobuf_wire(bytes(wire_without_payload))

    with pytest.raises(ValueError, match="exactly one payload"):
        GatewayStreamRequest.from_protobuf_wire(bytes(wire_with_repeated_payload))

    with pytest.raises(ValueError, match="unsupported wire type|unterminated|exactly one payload"):
        GatewayStreamRequest.from_protobuf_wire(b"\xff")


def test_gateway_stream_response_round_trips_status_and_reason() -> None:
    response = GatewayStreamResponse(
        response_id="grpc-accepted",
        request_id="req-001",
        status=GatewayAckStatus.ACCEPTED,
        reason_code="accepted",
    )

    decoded = GatewayStreamResponse.from_protobuf_wire(response.to_protobuf_wire())

    assert decoded == response
