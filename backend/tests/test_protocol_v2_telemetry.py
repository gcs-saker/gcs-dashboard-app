from __future__ import annotations

import json
from pathlib import Path

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
        roll_deg=1.3,
        pitch_deg=-2.1,
        yaw_deg=127.0,
        gyro_x_rad_per_sec=0.01,
        gyro_y_rad_per_sec=-0.02,
        gyro_z_rad_per_sec=0.03,
        accel_x_mps2=0.1,
        accel_y_mps2=0.2,
        accel_z_mps2=9.81,
        link_quality_percent=92.5,
    )

    encoded = telemetry.to_protobuf_wire()
    decoded = TelemetryEnvelopePayload.from_protobuf_wire(encoded)

    assert decoded == telemetry
    assert decoded.to_legacy_telemetry().uuid == "raw.mobile.front"
    assert decoded.to_legacy_telemetry().latitude == 35.871435
    assert decoded.roll_deg == 1.3
    assert decoded.pitch_deg == -2.1
    assert decoded.yaw_deg == 127.0
    assert decoded.gyro_z_rad_per_sec == 0.03
    assert decoded.accel_z_mps2 == 9.81
    assert decoded.link_quality_percent == 92.5
    assert len(encoded) < len(str(telemetry).encode("utf-8"))


def test_json_schema_covers_mobile_robot_and_drone_sensor_fields() -> None:
    schema_path = Path(__file__).parents[2] / "contracts" / "schemas" / "telemetry.schema.json"
    schema = json.loads(schema_path.read_text(encoding="utf-8"))

    assert schema["properties"]["assetKind"]["enum"] == [
        "drone",
        "groundRobot",
        "fixedCamera",
        "operatorDevice",
    ]
    assert {
        "timestamp",
        "position",
        "headingDeg",
        "speedMps",
        "batteryPercent",
        "attitudeDeg",
        "gyroRadPerSec",
        "accelMps2",
        "linkQualityPercent",
    }.issubset(schema["required"])
