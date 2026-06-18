from __future__ import annotations

from modules.protocol_v2.telemetry import AssetKinds, HealthStates, TelemetryEnvelopePayload


def test_telemetry_envelope_round_trips_through_protobuf_wire() -> None:
    telemetry = TelemetryEnvelopePayload.create(
        org_id="a4ai",
        group_id="co-a",
        asset_id="raw.mobile.front",
        asset_kind=AssetKinds.OPERATOR_DEVICE,
        latitude=35.871435,
        longitude=128.601445,
        altitude_m=84.5,
        heading_deg=7.2,
        speed_mps=3.5,
        battery_percent=78.0,
        health=HealthStates.OK,
        active_stream_ids=("raw.mobile.front",),
        observed_unix_millis=1_781_721_600_000,
        received_unix_millis=1_781_721_600_042,
    )

    encoded = telemetry.to_protobuf_wire()
    decoded = TelemetryEnvelopePayload.from_protobuf_wire(encoded)

    assert decoded == telemetry
    assert decoded.to_legacy_telemetry().uuid == "raw.mobile.front"
    assert decoded.to_legacy_telemetry().latitude == 35.871435
    assert len(encoded) < len(str(telemetry).encode("utf-8"))
