from __future__ import annotations

from dataclasses import dataclass
import os
from typing import Protocol

from api.telemetry import upsert_telemetry
from core.db import SessionLocal
from model.telemetry_model import TelemetryCreate
from modules.telemetry_buffer.buffer import (
    InMemoryTelemetryWriteBuffer,
    TelemetryBufferRecord,
    TelemetryWriteBuffer,
)
from modules.telemetry_buffer.bulk_sql import (
    TelemetryBulkBatch,
    TelemetrySqlDialect,
    build_mysql_latest_bulk_upsert,
    build_postgres_history_bulk_insert,
    build_postgres_latest_bulk_upsert,
)


class TelemetryBufferEnv:
    AUTO_FLUSH_MAX_ITEMS = "TELEMETRY_BUFFER_AUTO_FLUSH_MAX_ITEMS"


class TelemetryBulkSink(Protocol):
    def flush(self, records: list[TelemetryBufferRecord]) -> int:
        ...


@dataclass(frozen=True)
class TelemetryFlushResult:
    flushed_count: int


class LegacyDbTelemetryBulkSink:
    def flush(self, records: list[TelemetryBufferRecord]) -> int:
        if not records:
            return 0
        batch = TelemetryBulkBatch.from_records(records)
        with SessionLocal() as db:
            dialect = db.get_bind().dialect.name
            if dialect == TelemetrySqlDialect.POSTGRESQL:
                db.execute(build_postgres_latest_bulk_upsert(batch))
                db.execute(build_postgres_history_bulk_insert(batch))
                db.commit()
                return len(batch)
            if dialect in {TelemetrySqlDialect.MYSQL, TelemetrySqlDialect.MARIADB}:
                db.execute(build_mysql_latest_bulk_upsert(batch))
                db.commit()
                return len(batch)
            for record in records:
                upsert_telemetry(record.telemetry, db)
        return len(records)


class BufferedTelemetrySink:
    def __init__(
        self,
        buffer: TelemetryWriteBuffer,
        bulk_sink: TelemetryBulkSink | None = None,
        auto_flush_max_items: int = 0,
    ) -> None:
        self._buffer = buffer
        self._bulk_sink = bulk_sink
        self._auto_flush_max_items = auto_flush_max_items

    @property
    def buffer(self) -> TelemetryWriteBuffer:
        return self._buffer

    def upsert(self, telemetry: TelemetryCreate) -> TelemetryCreate:
        record = TelemetryBufferRecord.create(telemetry)
        self._buffer.put_latest(record)
        self._buffer.append_history(record)
        if self._bulk_sink is not None and self._auto_flush_max_items > 0:
            pending = self._buffer.stats().pending_history_count
            if pending >= self._auto_flush_max_items:
                self.flush_once(self._auto_flush_max_items)
        return telemetry

    def flush_once(self, max_items: int) -> TelemetryFlushResult:
        if self._bulk_sink is None:
            return TelemetryFlushResult(flushed_count=0)
        records = self._buffer.drain_history(max_items)
        if not records:
            return TelemetryFlushResult(flushed_count=0)
        try:
            flushed_count = self._bulk_sink.flush(records)
        except Exception:
            self._buffer.restore_history_front(records)
            raise
        if flushed_count != len(records):
            self._buffer.restore_history_front(records[flushed_count:])
        return TelemetryFlushResult(flushed_count=flushed_count)


def build_buffered_telemetry_sink() -> BufferedTelemetrySink:
    return BufferedTelemetrySink(
        buffer=InMemoryTelemetryWriteBuffer(),
        bulk_sink=LegacyDbTelemetryBulkSink(),
        auto_flush_max_items=int(os.getenv(TelemetryBufferEnv.AUTO_FLUSH_MAX_ITEMS, "1000")),
    )
