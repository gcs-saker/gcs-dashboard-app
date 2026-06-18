from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
import os
from typing import Protocol

import paho.mqtt.client as mqtt

MqttPayload = str | bytes


class MqttEnv:
    HOST = "MQTT_HOST"
    PORT = "MQTT_PORT"
    CLIENT_ID = "MQTT_CLIENT_ID"
    KEEPALIVE = "MQTT_KEEPALIVE"
    USERNAME = "MQTT_USERNAME"
    PASSWORD = "MQTT_PASSWORD"


@dataclass(frozen=True)
class MqttSettings:
    host: str = "localhost"
    port: int = 1883
    client_id: str = "gcs_backend_pub"
    keepalive: int = 60
    username: str | None = None
    password: str | None = None

    @classmethod
    def from_env(cls) -> "MqttSettings":
        return cls(
            host=os.getenv(MqttEnv.HOST, cls.host),
            port=int(os.getenv(MqttEnv.PORT, str(cls.port))),
            client_id=os.getenv(MqttEnv.CLIENT_ID, cls.client_id),
            keepalive=int(os.getenv(MqttEnv.KEEPALIVE, str(cls.keepalive))),
            username=optional_env(MqttEnv.USERNAME),
            password=optional_env(MqttEnv.PASSWORD),
        )


class PublishableMqttClient(Protocol):
    def publish(self, topic: str, payload: MqttPayload) -> object:
        ...


def optional_env(name: str) -> str | None:
    value = os.getenv(name)
    if value is None:
        return None
    stripped = value.strip()
    return stripped or None


@lru_cache(maxsize=1)
def get_mqtt_client() -> PublishableMqttClient:
    settings = MqttSettings.from_env()
    client = mqtt.Client(settings.client_id)
    if settings.username is not None:
        client.username_pw_set(settings.username, settings.password)
    client.connect(settings.host, settings.port, keepalive=settings.keepalive)
    client.loop_start()
    return client


def publish_control_command(
    topic: str,
    message: MqttPayload,
    client: PublishableMqttClient | None = None,
) -> None:
    print(f"MQTT -> {topic}: {mqtt_payload_log_value(message)}")
    mqtt_client = client or get_mqtt_client()
    mqtt_client.publish(topic, message)


def mqtt_payload_log_value(message: MqttPayload) -> str:
    if isinstance(message, bytes):
        return f"<binary {len(message)} bytes>"
    return message
