from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
import os
from typing import Protocol

import paho.mqtt.client as mqtt


@dataclass(frozen=True)
class MqttSettings:
    host: str = "localhost"
    port: int = 1883
    client_id: str = "gcs_backend_pub"
    keepalive: int = 60

    @classmethod
    def from_env(cls) -> "MqttSettings":
        return cls(
            host=os.getenv("MQTT_HOST", cls.host),
            port=int(os.getenv("MQTT_PORT", str(cls.port))),
            client_id=os.getenv("MQTT_CLIENT_ID", cls.client_id),
            keepalive=int(os.getenv("MQTT_KEEPALIVE", str(cls.keepalive))),
        )


class PublishableMqttClient(Protocol):
    def publish(self, topic: str, payload: str) -> object:
        ...


@lru_cache(maxsize=1)
def get_mqtt_client() -> PublishableMqttClient:
    settings = MqttSettings.from_env()
    client = mqtt.Client(settings.client_id)
    client.connect(settings.host, settings.port, keepalive=settings.keepalive)
    client.loop_start()
    return client


def publish_control_command(
    topic: str,
    message: str,
    client: PublishableMqttClient | None = None,
) -> None:
    print(f"📡 MQTT → {topic}: {message}")
    mqtt_client = client or get_mqtt_client()
    mqtt_client.publish(topic, message)
