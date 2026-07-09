from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from functools import lru_cache
from typing import Protocol

import paho.mqtt.client as mqtt

MqttPayload = str | bytes
logger = logging.getLogger(__name__)


class MqttEnv:
    HOST = "MQTT_HOST"
    PORT = "MQTT_PORT"
    CLIENT_ID = "MQTT_CLIENT_ID"
    KEEPALIVE = "MQTT_KEEPALIVE"
    USERNAME = "MQTT_USERNAME"
    PASSWORD = "MQTT_PASSWORD"
    RECONNECT_MIN_DELAY = "MQTT_RECONNECT_MIN_DELAY_SECONDS"
    RECONNECT_MAX_DELAY = "MQTT_RECONNECT_MAX_DELAY_SECONDS"
    MAX_INFLIGHT_MESSAGES = "MQTT_MAX_INFLIGHT_MESSAGES"


@dataclass(frozen=True)
class MqttSettings:
    host: str = "localhost"
    port: int = 1883
    client_id: str = "gcs_backend_pub"
    keepalive: int = 60
    username: str | None = None
    password: str | None = None
    reconnect_min_delay_seconds: int = 1
    reconnect_max_delay_seconds: int = 30
    max_inflight_messages: int = 20

    @classmethod
    def from_env(cls) -> "MqttSettings":
        reconnect_min_delay_seconds = positive_int_env(
            MqttEnv.RECONNECT_MIN_DELAY,
            cls.reconnect_min_delay_seconds,
        )
        reconnect_max_delay_seconds = positive_int_env(
            MqttEnv.RECONNECT_MAX_DELAY,
            cls.reconnect_max_delay_seconds,
        )
        return cls(
            host=os.getenv(MqttEnv.HOST, cls.host),
            port=positive_int_env(MqttEnv.PORT, cls.port),
            client_id=os.getenv(MqttEnv.CLIENT_ID, cls.client_id),
            keepalive=positive_int_env(MqttEnv.KEEPALIVE, cls.keepalive),
            username=optional_env(MqttEnv.USERNAME),
            password=optional_env(MqttEnv.PASSWORD),
            reconnect_min_delay_seconds=reconnect_min_delay_seconds,
            reconnect_max_delay_seconds=max(reconnect_min_delay_seconds, reconnect_max_delay_seconds),
            max_inflight_messages=positive_int_env(MqttEnv.MAX_INFLIGHT_MESSAGES, cls.max_inflight_messages),
        )


class PublishableMqttClient(Protocol):
    def publish(self, topic: str, payload: MqttPayload) -> object: ...


def optional_env(name: str) -> str | None:
    value = os.getenv(name)
    if value is None:
        return None
    stripped = value.strip()
    return stripped or None


def positive_int_env(name: str, default: int) -> int:
    try:
        value = int(os.getenv(name, str(default)))
    except ValueError:
        return default
    return value if value > 0 else default


def configure_mqtt_resilience(client: object, settings: MqttSettings) -> None:
    reconnect_delay_set = getattr(client, "reconnect_delay_set", None)
    if callable(reconnect_delay_set):
        reconnect_delay_set(
            min_delay=settings.reconnect_min_delay_seconds,
            max_delay=settings.reconnect_max_delay_seconds,
        )
    max_inflight_messages_set = getattr(client, "max_inflight_messages_set", None)
    if callable(max_inflight_messages_set):
        max_inflight_messages_set(settings.max_inflight_messages)


@lru_cache(maxsize=1)
def get_mqtt_client() -> PublishableMqttClient:
    settings = MqttSettings.from_env()
    client = mqtt.Client(settings.client_id)
    configure_mqtt_resilience(client, settings)
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
    logger.info("MQTT publish topic=%s payload=%s", topic, mqtt_payload_log_value(message))
    mqtt_client = client or get_mqtt_client()
    result = mqtt_client.publish(topic, message)
    rc = getattr(result, "rc", 0)
    if rc:
        raise RuntimeError(f"MQTT publish failed: rc={rc}")


def mqtt_payload_log_value(message: MqttPayload) -> str:
    if isinstance(message, bytes):
        return f"<binary {len(message)} bytes>"
    return message
