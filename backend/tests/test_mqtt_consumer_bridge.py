from __future__ import annotations

import pytest

from api.telemetry import upsert_telemetry
from core.db import Base, engine
from model.telemetry_model import TelemetryCreate
from modules.protocol_v2.telemetry import TelemetryEnvelopePayload
from modules.telemetry_buffer import BufferedTelemetrySink, InMemoryTelemetryWriteBuffer
from mqtt.consumer_bridge import MqttConsumerBridge, parse_asset_message


class FakeTelemetrySink:
    def __init__(self) -> None:
        self.items: list[TelemetryCreate] = []

    def upsert(self, telemetry: TelemetryCreate) -> TelemetryCreate:
        self.items.append(telemetry)
        return telemetry


def test_mqtt_consumer_bridge_decodes_protobuf_telemetry_payload() -> None:
    sink = FakeTelemetrySink()
    bridge = MqttConsumerBridge(sink)
    telemetry = TelemetryEnvelopePayload.create(
        org_id="a4ai",
        group_id="co-a",
        asset_id="raw.mobile.front",
        latitude=35.871435,
        longitude=128.601445,
        altitude_m=84.5,
        heading_deg=7.2,
        speed_mps=3.5,
        battery_percent=78.0,
    )

    result = bridge.handle_message("gcs/a4ai/co-a/raw.mobile.front/telemetry", telemetry.to_protobuf_wire())

    assert result == sink.items[0]
    assert sink.items[0].uuid == "raw.mobile.front"
    assert sink.items[0].latitude == 35.871435
    assert sink.items[0].longitude == 128.601445
    assert sink.items[0].phone_battery_soc == 78.0


def test_mqtt_consumer_bridge_can_route_telemetry_through_write_buffer() -> None:
    buffer = InMemoryTelemetryWriteBuffer()
    bridge = MqttConsumerBridge(BufferedTelemetrySink(buffer=buffer))
    telemetry = TelemetryEnvelopePayload.create(
        org_id="a4ai",
        group_id="co-a",
        asset_id="raw.mobile.front",
        latitude=35.871435,
        longitude=128.601445,
    )

    result = bridge.handle_message("gcs/a4ai/co-a/raw.mobile.front/telemetry", telemetry.to_protobuf_wire())

    latest = buffer.latest_for("raw.mobile.front")
    assert result is not None
    assert latest is not None
    assert latest.telemetry.latitude == 35.871435
    assert buffer.stats().pending_history_count == 1


def test_mqtt_consumer_bridge_rejects_topic_payload_identity_mismatch() -> None:
    bridge = MqttConsumerBridge(FakeTelemetrySink())
    telemetry = TelemetryEnvelopePayload.create(
        org_id="a4ai",
        group_id="co-a",
        asset_id="raw.mobile.front",
        latitude=35.871435,
        longitude=128.601445,
    )

    with pytest.raises(ValueError, match="does not match MQTT topic identity"):
        bridge.handle_message("gcs/a4ai/co-a/raw.other/telemetry", telemetry.to_protobuf_wire())


def test_parse_asset_message_rejects_non_gcs_topics() -> None:
    with pytest.raises(ValueError, match="invalid GCS-Saker MQTT topic"):
        parse_asset_message("robot/control/CID001", b"stop")


def test_mqtt_v2_telemetry_payload_can_reuse_legacy_db_upsert_path() -> None:
    Base.metadata.create_all(bind=engine)
    telemetry = TelemetryEnvelopePayload.create(
        org_id="a4ai",
        group_id="co-a",
        asset_id="raw.mobile.db",
        latitude=35.871435,
        longitude=128.601445,
        altitude_m=84.5,
    )
    decoded = TelemetryEnvelopePayload.from_protobuf_wire(telemetry.to_protobuf_wire())

    with next_session() as db:
        first = upsert_telemetry(decoded.to_legacy_telemetry(), db)
        second_payload = TelemetryEnvelopePayload.create(
            org_id="a4ai",
            group_id="co-a",
            asset_id="raw.mobile.db",
            latitude=35.9,
            longitude=128.7,
            altitude_m=90,
        )
        second = upsert_telemetry(second_payload.to_legacy_telemetry(), db)

    assert first.uuid == "raw.mobile.db"
    assert second.uuid == "raw.mobile.db"
    assert second.latitude == 35.9
    assert second.longitude == 128.7


def next_session():
    from core.db import SessionLocal

    return SessionLocal()
