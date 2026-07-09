from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Any, Callable, Protocol

import paho.mqtt.client as mqtt
from fastapi import FastAPI

from modules.telemetry_buffer import build_buffered_telemetry_sink
from mqtt.client import MqttSettings, configure_mqtt_resilience
from mqtt.consumer_bridge import MqttConsumerBridge
from mqtt.topics import telemetry_subscription_topic


class SubscribableMqttClient(Protocol):
    on_connect: Callable[[Any, Any, Any, int], None] | None
    on_message: Callable[[Any, Any, Any], None] | None

    def username_pw_set(self, username: str, password: str | None = None) -> None: ...

    def reconnect_delay_set(self, min_delay: int, max_delay: int) -> None: ...

    def max_inflight_messages_set(self, inflight: int) -> None: ...

    def connect(self, host: str, port: int, keepalive: int) -> None: ...

    def subscribe(self, topic: str, qos: int = 0) -> object: ...

    def loop_start(self) -> None: ...


@dataclass(frozen=True)
class MqttSubscriberRuntime:
    client: SubscribableMqttClient
    topic: str


class MqttSubscriberEnv:
    ENABLED = "MQTT_V2_TELEMETRY_SUBSCRIBER_ENABLED"


def start_optional_telemetry_subscriber(app: FastAPI) -> None:
    if os.getenv(MqttSubscriberEnv.ENABLED, "false").strip().lower() != "true":
        return
    app.state.mqtt_v2_telemetry_subscriber = build_telemetry_subscriber()


def build_telemetry_subscriber(
    *,
    bridge: MqttConsumerBridge | None = None,
    settings: MqttSettings | None = None,
    client_factory: Callable[[str], SubscribableMqttClient] | None = None,
) -> MqttSubscriberRuntime:
    resolved_settings = settings or MqttSettings.from_env()
    resolved_bridge = bridge or MqttConsumerBridge(build_buffered_telemetry_sink())
    factory = client_factory or mqtt.Client
    client = factory(resolved_settings.client_id)
    configure_mqtt_resilience(client, resolved_settings)
    if resolved_settings.username is not None:
        client.username_pw_set(resolved_settings.username, resolved_settings.password)

    subscription_topic = telemetry_subscription_topic()

    def on_connect(client_obj: Any, _userdata: Any, _flags: Any, rc: int) -> None:
        if rc != 0:
            raise ConnectionError(f"MQTT telemetry subscriber failed to connect: rc={rc}")
        client_obj.subscribe(subscription_topic, qos=1)

    def on_message(_client_obj: Any, _userdata: Any, message: Any) -> None:
        payload = bytes(message.payload)
        resolved_bridge.handle_message(message.topic, payload)

    client.on_connect = on_connect
    client.on_message = on_message
    client.connect(resolved_settings.host, resolved_settings.port, keepalive=resolved_settings.keepalive)
    client.loop_start()
    return MqttSubscriberRuntime(client=client, topic=subscription_topic)
