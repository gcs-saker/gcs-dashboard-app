#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from sqlalchemy.dialects import mysql, postgresql

REPO_ROOT = Path(__file__).resolve().parents[2]
BACKEND_DIR = REPO_ROOT / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from model.telemetry_model import TelemetryCreate  # noqa: E402
from modules.telemetry_buffer import (  # noqa: E402
    BufferedTelemetrySink,
    InMemoryTelemetryWriteBuffer,
    TelemetryBufferRecord,
)
from modules.telemetry_buffer.bulk_sql import (  # noqa: E402
    TelemetryBulkBatch,
    build_mysql_latest_bulk_upsert,
    build_postgres_history_bulk_insert,
    build_postgres_latest_bulk_upsert,
    plan_mysql_latest_bulk_write,
    plan_postgres_bulk_write,
)

SCHEMA_VERSION = "telemetry-bulk-flush-benchmark-v1"
DEFAULT_RECORDS = 1_000
DEFAULT_BATCH_SIZE = 100


@dataclass(frozen=True)
class BenchmarkResult:
    records: int
    batch_size: int
    ingest_latency_ms: float
    flush_latency_ms: float
    ingest_throughput_records_per_sec: float
    flush_throughput_records_per_sec: float
    postgres_statement_count: int
    mysql_statement_count: int
    postgres_avoided_statement_count: int
    mysql_avoided_statement_count: int

    def to_dict(self) -> dict[str, Any]:
        return {
            "records": self.records,
            "batchSize": self.batch_size,
            "ingestLatencyMs": round(self.ingest_latency_ms, 3),
            "flushLatencyMs": round(self.flush_latency_ms, 3),
            "ingestThroughputRecordsPerSec": round(
                self.ingest_throughput_records_per_sec, 3
            ),
            "flushThroughputRecordsPerSec": round(
                self.flush_throughput_records_per_sec, 3
            ),
            "postgresStatementCount": self.postgres_statement_count,
            "mysqlStatementCount": self.mysql_statement_count,
            "postgresAvoidedStatementCount": self.postgres_avoided_statement_count,
            "mysqlAvoidedStatementCount": self.mysql_avoided_statement_count,
        }


class CompileOnlyBulkSink:
    def __init__(self) -> None:
        self.postgres_statement_count = 0
        self.mysql_statement_count = 0
        self.postgres_avoided_statement_count = 0
        self.mysql_avoided_statement_count = 0

    def flush(self, records: list[TelemetryBufferRecord]) -> int:
        batch = TelemetryBulkBatch.from_records(records)
        postgres_plan = plan_postgres_bulk_write(batch)
        mysql_plan = plan_mysql_latest_bulk_write(batch)
        build_postgres_latest_bulk_upsert(batch).compile(dialect=postgresql.dialect())
        build_postgres_history_bulk_insert(batch).compile(dialect=postgresql.dialect())
        build_mysql_latest_bulk_upsert(batch).compile(dialect=mysql.dialect())
        self.postgres_statement_count += postgres_plan.total_statement_count
        self.mysql_statement_count += mysql_plan.total_statement_count
        self.postgres_avoided_statement_count += postgres_plan.avoided_statement_count
        self.mysql_avoided_statement_count += mysql_plan.avoided_statement_count
        return len(records)


def telemetry(index: int) -> TelemetryCreate:
    return TelemetryCreate(
        uuid=f"raw.synthetic.{index % 50:03d}",
        latitude=35.87 + (index * 0.00001),
        longitude=128.60 + (index * 0.00001),
        altitude=80 + (index % 30),
        velocity=3.0 + (index % 10),
        phoneBatterySOC=80 - (index % 20),
        epochTime=index,
    )


def run_benchmark(records: int, batch_size: int) -> BenchmarkResult:
    if records <= 0:
        raise ValueError("records must be greater than zero")
    if batch_size <= 0:
        raise ValueError("batch_size must be greater than zero")

    bulk_sink = CompileOnlyBulkSink()
    sink = BufferedTelemetrySink(
        buffer=InMemoryTelemetryWriteBuffer(),
        bulk_sink=bulk_sink,
        auto_flush_max_items=0,
    )

    ingest_started = time.perf_counter_ns()
    for index in range(records):
        sink.upsert(telemetry(index))
    ingest_latency_ms = elapsed_ms(ingest_started)

    flush_latencies: list[float] = []
    flushed = 0
    while flushed < records:
        flush_started = time.perf_counter_ns()
        result = sink.flush_once(batch_size)
        latency = elapsed_ms(flush_started)
        if result.flushed_count == 0:
            break
        flush_latencies.append(latency)
        flushed += result.flushed_count

    flush_latency_ms = sum(flush_latencies)
    return BenchmarkResult(
        records=records,
        batch_size=batch_size,
        ingest_latency_ms=ingest_latency_ms,
        flush_latency_ms=flush_latency_ms,
        ingest_throughput_records_per_sec=throughput(records, ingest_latency_ms),
        flush_throughput_records_per_sec=throughput(flushed, flush_latency_ms),
        postgres_statement_count=bulk_sink.postgres_statement_count,
        mysql_statement_count=bulk_sink.mysql_statement_count,
        postgres_avoided_statement_count=bulk_sink.postgres_avoided_statement_count,
        mysql_avoided_statement_count=bulk_sink.mysql_avoided_statement_count,
    )


def elapsed_ms(started_ns: int) -> float:
    return (time.perf_counter_ns() - started_ns) / 1_000_000


def throughput(records: int, latency_ms: float) -> float:
    if latency_ms <= 0:
        return 0
    return records / (latency_ms / 1000)


def build_check_report() -> dict[str, Any]:
    return {
        "schemaVersion": SCHEMA_VERSION,
        "mode": "synthetic-compile-only",
        "metrics": [
            "ingestLatencyMs",
            "flushLatencyMs",
            "ingestThroughputRecordsPerSec",
            "flushThroughputRecordsPerSec",
            "postgresStatementCount",
            "mysqlStatementCount",
            "postgresAvoidedStatementCount",
            "mysqlAvoidedStatementCount",
        ],
        "notes": [
            "This benchmark does not require a live DB and measures buffer plus SQL statement construction cost.",
            "Use a DB-backed benchmark before production capacity claims.",
        ],
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Measure telemetry buffer and bulk flush synthetic throughput."
    )
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--records", type=int, default=DEFAULT_RECORDS)
    parser.add_argument("--batch-size", type=int, default=DEFAULT_BATCH_SIZE)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if args.check:
        print(json.dumps(build_check_report(), ensure_ascii=False, sort_keys=True))
        return 0
    result = run_benchmark(args.records, args.batch_size)
    print(
        json.dumps(
            {
                "schemaVersion": SCHEMA_VERSION,
                "mode": "synthetic-compile-only",
                "summary": result.to_dict(),
            },
            ensure_ascii=False,
            indent=2,
            sort_keys=True,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
