from __future__ import annotations

from collections import deque
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import datetime, timezone
from threading import RLock
from typing import Protocol

from model.telemetry_model import TelemetryCreate


@dataclass(frozen=True)
class TelemetryBufferRecord:
    key: str
    telemetry: TelemetryCreate
    received_at: datetime

    @classmethod
    def create(cls, telemetry: TelemetryCreate) -> "TelemetryBufferRecord":
        key = telemetry.uuid or ""
        return cls(key=key, telemetry=telemetry, received_at=datetime.now(timezone.utc))


@dataclass(frozen=True)
class TelemetryBufferStats:
    latest_count: int
    pending_history_count: int


class TelemetryWriteBuffer(Protocol):
    def put_latest(self, record: TelemetryBufferRecord) -> None:
        ...

    def append_history(self, record: TelemetryBufferRecord) -> None:
        ...

    def latest_for(self, key: str) -> TelemetryBufferRecord | None:
        ...

    def drain_history(self, max_items: int) -> list[TelemetryBufferRecord]:
        ...

    def restore_history_front(self, records: Iterable[TelemetryBufferRecord]) -> None:
        ...

    def stats(self) -> TelemetryBufferStats:
        ...


class InMemoryTelemetryWriteBuffer:
    def __init__(self) -> None:
        self._latest: dict[str, TelemetryBufferRecord] = {}
        self._history: deque[TelemetryBufferRecord] = deque()
        self._lock = RLock()

    def put_latest(self, record: TelemetryBufferRecord) -> None:
        with self._lock:
            self._latest[record.key] = record

    def append_history(self, record: TelemetryBufferRecord) -> None:
        with self._lock:
            self._history.append(record)

    def latest_for(self, key: str) -> TelemetryBufferRecord | None:
        with self._lock:
            return self._latest.get(key)

    def drain_history(self, max_items: int) -> list[TelemetryBufferRecord]:
        if max_items <= 0:
            return []
        drained: list[TelemetryBufferRecord] = []
        with self._lock:
            while self._history and len(drained) < max_items:
                drained.append(self._history.popleft())
        return drained

    def restore_history_front(self, records: Iterable[TelemetryBufferRecord]) -> None:
        records_to_restore = list(records)
        if not records_to_restore:
            return
        with self._lock:
            for record in reversed(records_to_restore):
                self._history.appendleft(record)

    def stats(self) -> TelemetryBufferStats:
        with self._lock:
            return TelemetryBufferStats(
                latest_count=len(self._latest),
                pending_history_count=len(self._history),
            )
