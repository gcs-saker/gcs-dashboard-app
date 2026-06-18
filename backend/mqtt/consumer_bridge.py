from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from model.telemetry_model import TelemetryCreate
from modules.protocol_v2.telemetry import TelemetryEnvelopePayload
from mqtt.topics import MqttTopicSegments


class TelemetrySink(Protocol):
    def upsert(self, telemetry: TelemetryCreate) -> object:
        ...


@dataclass(frozen=True)
class MqttAssetMessage:
    org_id: str
    group_id: str
    asset_id: str
    channel: str
    payload: bytes


class MqttConsumerBridge:
    def __init__(self, telemetry_sink: TelemetrySink) -> None:
        self.telemetry_sink = telemetry_sink

    def handle_message(self, topic: str, payload: bytes) -> object | None:
        message = parse_asset_message(topic, payload)
        if message.channel == MqttTopicSegments.TELEMETRY:
            telemetry = TelemetryEnvelopePayload.from_protobuf_wire(message.payload)
            if telemetry.org_id != message.org_id or telemetry.group_id != message.group_id or telemetry.asset_id != message.asset_id:
                raise ValueError("telemetry envelope does not match MQTT topic identity")
            return self.telemetry_sink.upsert(telemetry.to_legacy_telemetry())
        return None


def parse_asset_message(topic: str, payload: bytes) -> MqttAssetMessage:
    parts = topic.split("/")
    expected_parts = 5
    if len(parts) != expected_parts or parts[0] != MqttTopicSegments.ROOT:
        raise ValueError("invalid GCS-Saker MQTT topic")
    return MqttAssetMessage(
        org_id=parts[1],
        group_id=parts[2],
        asset_id=parts[3],
        channel=parts[4],
        payload=payload,
    )
