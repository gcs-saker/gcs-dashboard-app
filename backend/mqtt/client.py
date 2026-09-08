from __future__ import annotations

from functools import lru_cache
from typing import Protocol

import paho.mqtt.client as mqtt
from pydantic import Field, ValidationError, field_validator, model_validator

from core.env_parsing import empty_to_none
from core.settings_base import BackendBaseSettings, SettingsConfigurationError, settings_error_message
from core.structured_logging import get_logger
from core.tracing import trace_mqtt_publish

MqttPayload = str | bytes
logger = get_logger("mqtt")


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


class MqttSettings(BackendBaseSettings):
    host: str = Field("localhost", validation_alias=MqttEnv.HOST)
    port: int = Field(1883, validation_alias=MqttEnv.PORT, gt=0)
    client_id: str = Field("gcs_backend_pub", validation_alias=MqttEnv.CLIENT_ID)
    keepalive: int = Field(60, validation_alias=MqttEnv.KEEPALIVE, gt=0)
    username: str | None = Field(None, validation_alias=MqttEnv.USERNAME)
    password: str | None = Field(None, validation_alias=MqttEnv.PASSWORD)
    reconnect_min_delay_seconds: int = Field(1, validation_alias=MqttEnv.RECONNECT_MIN_DELAY, gt=0)
    reconnect_max_delay_seconds: int = Field(30, validation_alias=MqttEnv.RECONNECT_MAX_DELAY, gt=0)
    max_inflight_messages: int = Field(20, validation_alias=MqttEnv.MAX_INFLIGHT_MESSAGES, gt=0)

    @field_validator("host", "client_id", mode="before")
    @classmethod
    def default_blank_required_string(cls, value: object) -> object:
        if isinstance(value, str):
            return empty_to_none(value)
        return value

    @field_validator("username", "password", mode="before")
    @classmethod
    def blank_optional_string_to_none(cls, value: object) -> object:
        if isinstance(value, str):
            return empty_to_none(value)
        return value

    @model_validator(mode="after")
    def normalize_reconnect_window(self) -> "MqttSettings":
        if self.reconnect_max_delay_seconds < self.reconnect_min_delay_seconds:
            self.reconnect_max_delay_seconds = self.reconnect_min_delay_seconds
        return self

    @classmethod
    def from_env(cls) -> "MqttSettings":
        try:
            return cls()
        except ValidationError as exc:
            raise SettingsConfigurationError(settings_error_message("mqtt", exc)) from exc


class PublishableMqttClient(Protocol):
    def publish(self, topic: str, payload: MqttPayload) -> object: ...


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
    logger.info(
        "mqtt_publish_requested",
        destination_channel=mqtt_destination_channel(topic),
        payload_kind=mqtt_payload_kind(message),
        payload_bytes=mqtt_payload_size(message),
    )
    mqtt_client = client or get_mqtt_client()
    with trace_mqtt_publish(destination_channel=mqtt_destination_channel(topic)):
        result = mqtt_client.publish(topic, message)
    rc = getattr(result, "rc", 0)
    if rc:
        raise RuntimeError(f"MQTT publish failed: rc={rc}")


def mqtt_payload_kind(message: MqttPayload) -> str:
    if isinstance(message, bytes):
        return "binary"
    return "text"


def mqtt_payload_size(message: MqttPayload) -> int:
    if isinstance(message, bytes):
        return len(message)
    return len(message.encode("utf-8"))


def mqtt_destination_channel(topic: str) -> str:
    channel = topic.rsplit("/", maxsplit=1)[-1].strip()
    return channel if channel in {"command", "telemetry", "status", "command_ack"} else "unknown"
