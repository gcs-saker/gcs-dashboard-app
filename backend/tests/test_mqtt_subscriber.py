from __future__ import annotations

from types import SimpleNamespace
from typing import Any, Callable

from fastapi import FastAPI

import mqtt.subscriber as subscriber_module
from model.telemetry_model import TelemetryCreate
from modules.protocol_v2.telemetry import TelemetryEnvelopePayload
from mqtt.client import MqttSettings
from mqtt.consumer_bridge import MqttConsumerBridge
from mqtt.subscriber import build_telemetry_subscriber, start_optional_telemetry_subscriber
from mqtt.topics import telemetry_subscription_topic


class FakeTelemetrySink:
    def __init__(self) -> None:
        self.items: list[TelemetryCreate] = []

    def upsert(self, telemetry: TelemetryCreate) -> object:
        self.items.append(telemetry)
        return telemetry


class FakeSubscriberClient:
    def __init__(self, client_id: str) -> None:
        self.client_id = client_id
        self.on_connect: Callable[[Any, Any, Any, int], None] | None = None
        self.on_message: Callable[[Any, Any, Any], None] | None = None
        self.credentials: tuple[str, str | None] | None = None
        self.connected: tuple[str, int, int] | None = None
        self.subscriptions: list[tuple[str, int]] = []
        self.loop_started = False
        self.reconnect_delays: tuple[int, int] | None = None
        self.max_inflight: int | None = None

    def username_pw_set(self, username: str, password: str | None = None) -> None:
        self.credentials = (username, password)

    def connect(self, host: str, port: int, keepalive: int) -> None:
        self.connected = (host, port, keepalive)

    def subscribe(self, topic: str, qos: int = 0) -> object:
        self.subscriptions.append((topic, qos))
        return object()

    def loop_start(self) -> None:
        self.loop_started = True

    def reconnect_delay_set(self, min_delay: int, max_delay: int) -> None:
        self.reconnect_delays = (min_delay, max_delay)

    def max_inflight_messages_set(self, inflight: int) -> None:
        self.max_inflight = inflight


def test_build_telemetry_subscriber_connects_and_subscribes_to_v2_topic() -> None:
    fake_client = FakeSubscriberClient("gcs-telemetry-consumer")
    sink = FakeTelemetrySink()
    runtime = build_telemetry_subscriber(
        bridge=MqttConsumerBridge(sink),
        settings=MqttSettings(
            host="mqtt.internal",
            port=1884,
            client_id="gcs-telemetry-consumer",
            keepalive=30,
            username="consumer",
            password="secret",
        ),
        client_factory=lambda _client_id: fake_client,
    )

    assert runtime.client is fake_client
    assert runtime.topic == telemetry_subscription_topic()
    assert fake_client.credentials == ("consumer", "secret")
    assert fake_client.connected == ("mqtt.internal", 1884, 30)
    assert fake_client.reconnect_delays == (1, 30)
    assert fake_client.max_inflight == 20
    assert fake_client.loop_started is True

    assert fake_client.on_connect is not None
    fake_client.on_connect(fake_client, None, None, 0)

    assert fake_client.subscriptions == [(telemetry_subscription_topic(), 1)]


def test_telemetry_subscriber_dispatches_mqtt_message_to_bridge() -> None:
    fake_client = FakeSubscriberClient("gcs-telemetry-consumer")
    sink = FakeTelemetrySink()
    build_telemetry_subscriber(
        bridge=MqttConsumerBridge(sink),
        settings=MqttSettings(client_id="gcs-telemetry-consumer"),
        client_factory=lambda _client_id: fake_client,
    )
    telemetry = TelemetryEnvelopePayload.create(
        org_id="a4ai",
        group_id="co-a",
        asset_id="raw.mobile.front",
        latitude=35.871435,
        longitude=128.601445,
    )

    assert fake_client.on_message is not None
    fake_client.on_message(
        fake_client,
        None,
        SimpleNamespace(
            topic="gcs/a4ai/co-a/raw.mobile.front/telemetry",
            payload=telemetry.to_protobuf_wire(),
        ),
    )

    assert len(sink.items) == 1
    assert sink.items[0].uuid == "raw.mobile.front"
    assert sink.items[0].latitude == 35.871435


def test_optional_telemetry_subscriber_stays_disabled_by_default(monkeypatch) -> None:
    app = FastAPI()
    monkeypatch.delenv("MQTT_V2_TELEMETRY_SUBSCRIBER_ENABLED", raising=False)

    start_optional_telemetry_subscriber(app)

    assert not hasattr(app.state, "mqtt_v2_telemetry_subscriber")


def test_optional_telemetry_subscriber_starts_when_enabled(monkeypatch) -> None:
    app = FastAPI()
    runtime = object()
    monkeypatch.setenv("MQTT_V2_TELEMETRY_SUBSCRIBER_ENABLED", "true")
    monkeypatch.setattr(subscriber_module, "build_telemetry_subscriber", lambda: runtime)

    start_optional_telemetry_subscriber(app)

    assert app.state.mqtt_v2_telemetry_subscriber is runtime
