from __future__ import annotations

import pytest
from sqlalchemy.dialects import mysql, postgresql

from model.telemetry_model import TelemetryCreate
from modules.telemetry_buffer import (
    BufferedTelemetrySink,
    InMemoryTelemetryWriteBuffer,
    RedisTelemetryBufferConfig,
    RedisTelemetryWriteBuffer,
    TelemetryBufferRecord,
)
from modules.telemetry_buffer.bulk_sql import (
    TelemetryBulkBatch,
    build_mysql_latest_bulk_upsert,
    build_postgres_history_bulk_insert,
    build_postgres_latest_bulk_upsert,
)


class RecordingBulkSink:
    def __init__(self, flushed_count: int | None = None) -> None:
        self.batches: list[list[TelemetryBufferRecord]] = []
        self._flushed_count = flushed_count

    def flush(self, records: list[TelemetryBufferRecord]) -> int:
        self.batches.append(records)
        return self._flushed_count if self._flushed_count is not None else len(records)


class FailingBulkSink:
    def flush(self, records: list[TelemetryBufferRecord]) -> int:
        raise RuntimeError("postgres bulk flush failed")


class FakeRedisListClient:
    def __init__(self) -> None:
        self.values: dict[str, str] = {}
        self.lists: dict[str, list[str]] = {}

    def set(self, name: str, value: str) -> None:
        self.values[name] = value

    def get(self, name: str) -> str | None:
        return self.values.get(name)

    def rpush(self, name: str, value: str) -> None:
        self.lists.setdefault(name, []).append(value)

    def lpop(self, name: str) -> str | None:
        values = self.lists.setdefault(name, [])
        if not values:
            return None
        return values.pop(0)

    def lpush(self, name: str, value: str) -> None:
        self.lists.setdefault(name, []).insert(0, value)

    def llen(self, name: str) -> int:
        return len(self.lists.get(name, []))


def telemetry(uuid: str, latitude: float) -> TelemetryCreate:
    return TelemetryCreate(uuid=uuid, latitude=latitude, longitude=128.6)


def test_write_buffer_overwrites_latest_but_keeps_history_samples() -> None:
    buffer = InMemoryTelemetryWriteBuffer()
    first = TelemetryBufferRecord.create(telemetry("raw.mobile.front", 35.87))
    second = TelemetryBufferRecord.create(telemetry("raw.mobile.front", 35.88))

    buffer.put_latest(first)
    buffer.append_history(first)
    buffer.put_latest(second)
    buffer.append_history(second)

    latest = buffer.latest_for("raw.mobile.front")
    drained = buffer.drain_history(10)

    assert latest is not None
    assert latest.telemetry.latitude == 35.88
    assert [record.telemetry.latitude for record in drained] == [35.87, 35.88]
    assert buffer.stats().pending_history_count == 0


def test_buffered_sink_flushes_history_in_batches_without_touching_latest() -> None:
    buffer = InMemoryTelemetryWriteBuffer()
    bulk_sink = RecordingBulkSink()
    sink = BufferedTelemetrySink(buffer=buffer, bulk_sink=bulk_sink)

    sink.upsert(telemetry("raw.mobile.front", 35.87))
    sink.upsert(telemetry("raw.mobile.rear", 35.88))
    result = sink.flush_once(max_items=1)

    assert result.flushed_count == 1
    assert len(bulk_sink.batches) == 1
    assert bulk_sink.batches[0][0].telemetry.uuid == "raw.mobile.front"
    assert buffer.stats().pending_history_count == 1
    assert buffer.latest_for("raw.mobile.front") is not None
    assert buffer.latest_for("raw.mobile.rear") is not None


def test_buffered_sink_restores_drained_batch_when_bulk_flush_fails() -> None:
    buffer = InMemoryTelemetryWriteBuffer()
    sink = BufferedTelemetrySink(buffer=buffer, bulk_sink=FailingBulkSink())

    sink.upsert(telemetry("raw.mobile.front", 35.87))
    sink.upsert(telemetry("raw.mobile.rear", 35.88))

    with pytest.raises(RuntimeError, match="postgres bulk flush failed"):
        sink.flush_once(max_items=10)

    drained = buffer.drain_history(10)
    assert [record.telemetry.uuid for record in drained] == ["raw.mobile.front", "raw.mobile.rear"]


def test_buffered_sink_restores_unflushed_tail_when_bulk_sink_accepts_partial_batch() -> None:
    buffer = InMemoryTelemetryWriteBuffer()
    bulk_sink = RecordingBulkSink(flushed_count=1)
    sink = BufferedTelemetrySink(buffer=buffer, bulk_sink=bulk_sink)

    sink.upsert(telemetry("raw.mobile.front", 35.87))
    sink.upsert(telemetry("raw.mobile.rear", 35.88))
    result = sink.flush_once(max_items=10)

    assert result.flushed_count == 1
    drained = buffer.drain_history(10)
    assert [record.telemetry.uuid for record in drained] == ["raw.mobile.rear"]


def test_buffered_sink_can_auto_flush_when_threshold_is_reached() -> None:
    buffer = InMemoryTelemetryWriteBuffer()
    bulk_sink = RecordingBulkSink()
    sink = BufferedTelemetrySink(buffer=buffer, bulk_sink=bulk_sink, auto_flush_max_items=2)

    sink.upsert(telemetry("raw.mobile.front", 35.87))
    assert buffer.stats().pending_history_count == 1
    sink.upsert(telemetry("raw.mobile.rear", 35.88))

    assert buffer.stats().pending_history_count == 0
    assert len(bulk_sink.batches) == 1
    assert [record.telemetry.uuid for record in bulk_sink.batches[0]] == [
        "raw.mobile.front",
        "raw.mobile.rear",
    ]


def test_redis_buffer_keeps_latest_and_history_contract_without_key_scan() -> None:
    client = FakeRedisListClient()
    buffer = RedisTelemetryWriteBuffer(
        client=client,
        config=RedisTelemetryBufferConfig(key_prefix="test:telemetry"),
    )
    first = TelemetryBufferRecord.create(telemetry("raw.mobile.front", 35.87))
    second = TelemetryBufferRecord.create(telemetry("raw.mobile.front", 35.88))

    buffer.put_latest(first)
    buffer.append_history(first)
    buffer.put_latest(second)
    buffer.append_history(second)

    latest = buffer.latest_for("raw.mobile.front")
    drained = buffer.drain_history(10)
    stats = buffer.stats()

    assert latest is not None
    assert latest.telemetry.latitude == 35.88
    assert [record.telemetry.latitude for record in drained] == [35.87, 35.88]
    assert stats.latest_count == 0
    assert stats.pending_history_count == 0


def test_redis_buffer_restores_drained_records_in_original_order() -> None:
    client = FakeRedisListClient()
    buffer = RedisTelemetryWriteBuffer(client=client)
    records = [
        TelemetryBufferRecord.create(telemetry("raw.mobile.front", 35.87)),
        TelemetryBufferRecord.create(telemetry("raw.mobile.rear", 35.88)),
    ]
    for record in records:
        buffer.append_history(record)

    drained = buffer.drain_history(10)
    buffer.restore_history_front(drained)

    restored = buffer.drain_history(10)
    assert [record.telemetry.uuid for record in restored] == [
        "raw.mobile.front",
        "raw.mobile.rear",
    ]


def test_telemetry_bulk_batch_rejects_records_without_stream_uuid() -> None:
    record = TelemetryBufferRecord.create(telemetry("", 35.87))

    with pytest.raises(ValueError, match="telemetry uuid is required"):
        TelemetryBulkBatch.from_records([record])


def test_mysql_bulk_upsert_compiles_to_single_insert_statement() -> None:
    records = [
        TelemetryBufferRecord.create(telemetry("raw.mobile.front", 35.87)),
        TelemetryBufferRecord.create(telemetry("raw.mobile.rear", 35.88)),
    ]
    batch = TelemetryBulkBatch.from_records(records)

    compiled = str(build_mysql_latest_bulk_upsert(batch).compile(dialect=mysql.dialect()))

    assert compiled.startswith("INSERT INTO telemetry_realtime")
    assert "ON DUPLICATE KEY UPDATE" in compiled
    assert compiled.count("INSERT INTO") == 1
    assert "SELECT" not in compiled


def test_postgres_bulk_latest_upsert_uses_conflict_contract() -> None:
    records = [
        TelemetryBufferRecord.create(telemetry("raw.mobile.front", 35.87)),
        TelemetryBufferRecord.create(telemetry("raw.mobile.rear", 35.88)),
    ]
    batch = TelemetryBulkBatch.from_records(records)

    compiled = str(build_postgres_latest_bulk_upsert(batch).compile(dialect=postgresql.dialect()))

    assert compiled.startswith("INSERT INTO telemetry_realtime")
    assert "ON CONFLICT (uuid) DO UPDATE" in compiled
    assert compiled.count("INSERT INTO") == 1


def test_postgres_history_bulk_insert_keeps_append_only_contract() -> None:
    records = [
        TelemetryBufferRecord.create(telemetry("raw.mobile.front", 35.87)),
        TelemetryBufferRecord.create(telemetry("raw.mobile.rear", 35.88)),
    ]
    batch = TelemetryBulkBatch.from_records(records)

    compiled = str(build_postgres_history_bulk_insert(batch).compile(dialect=postgresql.dialect()))

    assert compiled.startswith("INSERT INTO telemetry_history")
    assert "stream_uuid" in compiled
    assert "received_at" in compiled
    assert "ON CONFLICT" not in compiled
