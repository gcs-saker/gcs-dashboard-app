from __future__ import annotations

import pytest

from model.telemetry_model import TelemetryCreate
from modules.telemetry_buffer import BufferedTelemetrySink, InMemoryTelemetryWriteBuffer, TelemetryBufferRecord


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
