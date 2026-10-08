from __future__ import annotations

import json
from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Protocol

from pydantic import Field, ValidationError, field_validator

from core.env_parsing import empty_to_none
from core.settings_base import BackendBaseSettings, SettingsConfigurationError, settings_error_message
from model.telemetry_model import TelemetryCreate
from modules.telemetry_buffer.buffer import TelemetryBufferRecord, TelemetryBufferStats

TELEMETRY_REDIS_KEY_PREFIX_ENV = "TELEMETRY_REDIS_KEY_PREFIX"
RedisValue = str | bytes


class TelemetryRedisKeys:
    HISTORY_QUEUE = "history"
    LATEST_PREFIX = "latest"
    DEFAULT_PREFIX = "gcs-saker:telemetry-buffer"
    LATEST_COUNT_NOT_SCANNED = 0


class RedisListClient(Protocol):
    def set(self, name: str, value: str) -> Any: ...

    def get(self, name: str) -> RedisValue | None: ...

    def rpush(self, name: str, value: str) -> Any: ...

    def lpop(self, name: str, count: int) -> Sequence[RedisValue] | None: ...

    def lpush(self, name: str, *values: str) -> Any: ...

    def llen(self, name: str) -> int: ...


@dataclass(frozen=True)
class RedisTelemetryBufferConfig:
    key_prefix: str = TelemetryRedisKeys.DEFAULT_PREFIX

    @classmethod
    def from_env(cls) -> "RedisTelemetryBufferConfig":
        settings = RedisTelemetryBufferSettings.from_env()
        return cls(key_prefix=settings.key_prefix)

    def history_queue_key(self) -> str:
        return f"{self.key_prefix}:{TelemetryRedisKeys.HISTORY_QUEUE}"

    def latest_key(self, stream_key: str) -> str:
        return f"{self.key_prefix}:{TelemetryRedisKeys.LATEST_PREFIX}:{stream_key}"


class RedisTelemetryBufferSettings(BackendBaseSettings):
    key_prefix: str = Field(TelemetryRedisKeys.DEFAULT_PREFIX, validation_alias=TELEMETRY_REDIS_KEY_PREFIX_ENV)

    @field_validator("key_prefix", mode="before")
    @classmethod
    def default_blank_prefix(cls, value: object) -> object:
        if isinstance(value, str):
            return empty_to_none(value) or TelemetryRedisKeys.DEFAULT_PREFIX
        return value

    @classmethod
    def from_env(cls) -> "RedisTelemetryBufferSettings":
        try:
            return cls()
        except ValidationError as exc:
            raise SettingsConfigurationError(settings_error_message("redis telemetry buffer", exc)) from exc


class RedisTelemetryWriteBuffer:
    """Redis/Dragonfly compatible queue buffer for telemetry write-behind."""

    def __init__(self, client: RedisListClient, config: RedisTelemetryBufferConfig | None = None) -> None:
        self._client = client
        self._config = config or RedisTelemetryBufferConfig.from_env()

    def put_latest(self, record: TelemetryBufferRecord) -> None:
        self._client.set(self._config.latest_key(record.key), serialize_record(record))

    def append_history(self, record: TelemetryBufferRecord) -> None:
        self._client.rpush(self._config.history_queue_key(), serialize_record(record))

    def latest_for(self, key: str) -> TelemetryBufferRecord | None:
        return deserialize_record(self._client.get(self._config.latest_key(key)))

    def drain_history(self, max_items: int) -> list[TelemetryBufferRecord]:
        if max_items <= 0:
            return []
        values = self._client.lpop(self._config.history_queue_key(), max_items)
        return [deserialize_required_record(value) for value in popped_values(values)]

    def restore_history_front(self, records: Iterable[TelemetryBufferRecord]) -> None:
        serialized = [serialize_record(record) for record in reversed(list(records))]
        if serialized:
            self._client.lpush(self._config.history_queue_key(), *serialized)

    def stats(self) -> TelemetryBufferStats:
        return TelemetryBufferStats(
            latest_count=TelemetryRedisKeys.LATEST_COUNT_NOT_SCANNED,
            pending_history_count=self._client.llen(self._config.history_queue_key()),
        )


def serialize_record(record: TelemetryBufferRecord) -> str:
    return json.dumps(
        {
            "key": record.key,
            "received_at": record.received_at.isoformat(),
            "telemetry": record.telemetry.model_dump(mode="json", by_alias=True),
        },
        separators=(",", ":"),
    )


def deserialize_record(value: str | bytes | None) -> TelemetryBufferRecord | None:
    if value is None:
        return None
    raw_value = value.decode("utf-8") if isinstance(value, bytes) else value
    payload = json.loads(raw_value)
    return TelemetryBufferRecord(
        key=str(payload["key"]),
        received_at=datetime.fromisoformat(str(payload["received_at"])),
        telemetry=TelemetryCreate.model_validate(payload["telemetry"]),
    )


def popped_values(values: Sequence[RedisValue] | None) -> list[RedisValue]:
    if values is None:
        return []
    return list(values)


def deserialize_required_record(value: RedisValue) -> TelemetryBufferRecord:
    record = deserialize_record(value)
    if record is None:
        raise ValueError("popped telemetry record cannot be empty")
    return record
