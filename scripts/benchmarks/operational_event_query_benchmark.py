#!/usr/bin/env python3
"""Compare owned stream-metrics SQL on a new, explicitly local PostgreSQL fixture."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import statistics
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path

import psycopg2
from event_query_candidates import QueryCandidate, candidate_sql
from event_query_plan import (
    SCOPE_PARAMETERS,
    SQL_SOURCE,
    PlanMeasurement,
    QueryBenchmarkError,
    plan_measurement,
    stream_metrics_sql,
)
from psycopg2.extensions import connection as PgConnection

REPO_ROOT = Path(__file__).resolve().parents[2]
FIXTURE_DATABASE = "gcs_query_benchmark"
ALLOWED_HOSTS = frozenset({"localhost", "127.0.0.1", "postgres"})
EXPLAIN_PREFIX = "EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) "
SCHEMA_VERSION = "operational-event-query-benchmark-v1"


@dataclass(frozen=True)
class BenchmarkOptions:
    rows: int = 100_000
    repeats: int = 9
    work_mem_kb: int = 4_096
    baseline_ref: str = "origin/main"
    candidate: QueryCandidate = QueryCandidate.CURRENT

    def __post_init__(self) -> None:
        if not 1_000 <= self.rows <= 1_000_000 or not 3 <= self.repeats <= 31 or not 64 <= self.work_mem_kb <= 65_536:
            raise QueryBenchmarkError("fixture_bounds_invalid")


def git_output(*arguments: str) -> str:
    return subprocess.run(
        ["git", *arguments], cwd=REPO_ROOT, capture_output=True, text=True, check=True, timeout=10
    ).stdout.strip()


def owned_queries(options: BenchmarkOptions) -> tuple[str, str, str]:
    baseline = git_output("rev-parse", "--verify", options.baseline_ref + "^{commit}")
    if len(baseline) != 40 or any(character not in "0123456789abcdef" for character in baseline):
        raise QueryBenchmarkError("baseline_revision_invalid")
    before = stream_metrics_sql(git_output("show", baseline + ":" + SQL_SOURCE))
    after = candidate_sql(stream_metrics_sql((REPO_ROOT / SQL_SOURCE).read_text(encoding="utf-8")), options.candidate)
    return baseline, before, after


def connect_fixture() -> PgConnection:
    host = os.getenv("GCS_QUERY_BENCHMARK_HOST", "127.0.0.1")
    port = int(os.getenv("GCS_QUERY_BENCHMARK_PORT", "15433"))
    password = os.getenv("GCS_QUERY_BENCHMARK_PASSWORD")
    if host not in ALLOWED_HOSTS or not 1 <= port <= 65_535 or not password:
        raise QueryBenchmarkError("local_fixture_connection_invalid")
    return psycopg2.connect(
        host=host,
        port=port,
        dbname=FIXTURE_DATABASE,
        user="benchmark",
        password=password,
        connect_timeout=5,
        options="-c statement_timeout=120000 -c lock_timeout=2000",
    )


def initialize_fixture(connection: PgConnection, options: BenchmarkOptions) -> None:
    with connection, connection.cursor() as cursor:
        cursor.execute("SELECT current_database(), to_regclass('operational_events')")
        row = cursor.fetchone()
        if row is None or row[0] != FIXTURE_DATABASE or row[1] is not None:
            raise QueryBenchmarkError("fixture_must_be_new")
        cursor.execute("""CREATE TABLE operational_events (
            id VARCHAR(128) PRIMARY KEY, occurred_at TIMESTAMPTZ NOT NULL, group_id VARCHAR(64) NOT NULL,
            stream_id VARCHAR(128), connection_id VARCHAR(128), latency_ms BIGINT, throughput_mbps DOUBLE PRECISION,
            ice_path VARCHAR(32), relay_fallback_reason VARCHAR(255))""")
        cursor.execute(
            """CREATE TABLE organization_group_closure (ancestor_group_id VARCHAR(64), descendant_group_id VARCHAR(64))"""
        )
        cursor.execute(
            """INSERT INTO operational_events SELECT 'event-' || i,
            TIMESTAMPTZ '2026-10-15 00:00:00+00' + i * INTERVAL '1 millisecond',
            CASE WHEN MOD(i, 5) = 0 THEN 'co-b' ELSE 'co-a' END, 'stream-' || MOD(i, 100), 'session-' || MOD(i, 100),
            MOD(i, 100), 23.5, CASE WHEN MOD(i, 13) = 0 THEN NULL ELSE 'relay' END,
            CASE WHEN MOD(i, 17) = 0 THEN NULL ELSE 'synthetic' END FROM generate_series(1, %s) AS i""",
            (options.rows,),
        )
        cursor.execute("CREATE INDEX event_group_time ON operational_events (group_id, occurred_at DESC, id DESC)")
        cursor.execute("ANALYZE operational_events")
        cursor.execute("SET track_io_timing = on")
        cursor.execute("SELECT set_config('work_mem', %s, false)", (str(options.work_mem_kb) + "kB",))


def result_hash(connection: PgConnection, sql: str) -> str:
    with connection.cursor() as cursor:
        cursor.execute(sql, SCOPE_PARAMETERS)
        rows = sorted(cursor.fetchall(), key=repr)
    encoded = json.dumps(rows, default=str, separators=(",", ":")).encode()
    return hashlib.sha256(encoded).hexdigest()


def measure(connection: PgConnection, sql: str) -> PlanMeasurement:
    with connection.cursor() as cursor:
        cursor.execute(EXPLAIN_PREFIX + sql, SCOPE_PARAMETERS)
        row = cursor.fetchone()
    if row is None:
        raise QueryBenchmarkError("plan_missing")
    return plan_measurement(row[0])


def summary(samples: list[PlanMeasurement]) -> dict[str, object]:
    durations = sorted(sample.execution_ms for sample in samples)
    return {
        "p50_ms": round(statistics.median(durations), 3),
        "p95_ms": round(durations[math.ceil(len(durations) * 0.95) - 1], 3),
        "measurements": [sample.as_report() for sample in samples],
    }


def read_only_fixture(connection: PgConnection, options: BenchmarkOptions) -> None:
    connection.set_session(readonly=True)
    with connection.cursor() as cursor:
        cursor.execute("SELECT current_database(), COUNT(1) FROM operational_events")
        row = cursor.fetchone()
        if row is None or row[0] != FIXTURE_DATABASE or row[1] != options.rows:
            raise QueryBenchmarkError("fixture_size_mismatch")
        cursor.execute("SET track_io_timing = on")
        cursor.execute("SELECT set_config('work_mem', %s, false)", (str(options.work_mem_kb) + "kB",))


def run_benchmark(options: BenchmarkOptions, read_only: bool = False) -> dict[str, object]:
    baseline, before, after = owned_queries(options)
    connection = connect_fixture()
    try:
        if read_only:
            read_only_fixture(connection, options)
        else:
            initialize_fixture(connection, options)
        expected = result_hash(connection, before)
        if expected != result_hash(connection, after):
            raise QueryBenchmarkError("query_results_changed")
        samples: tuple[list[PlanMeasurement], list[PlanMeasurement]] = ([], [])
        for iteration in range(options.repeats):
            order = (0, 1) if iteration % 2 == 0 else (1, 0)
            for index in order:
                samples[index].append(measure(connection, (before, after)[index]))
        return build_report(options, baseline, samples, hashlib.sha256(after.encode()).hexdigest())
    finally:
        connection.close()


def build_report(
    options: BenchmarkOptions,
    baseline: str,
    samples: tuple[list[PlanMeasurement], list[PlanMeasurement]],
    candidate_hash: str,
) -> dict[str, object]:
    return {
        "schema_version": SCHEMA_VERSION,
        "result": "PASS",
        "results_equal": True,
        "baseline_commit": baseline,
        "candidate_sql_sha256": candidate_hash,
        "candidate": options.candidate.value,
        "performance_gate": "NOT_RUN; timing is measured, not a deterministic CI pass criterion",
        "rows": options.rows,
        "streams": 100,
        "repeats": options.repeats,
        "work_mem_kb": options.work_mem_kb,
        "before": summary(samples[0]),
        "after": summary(samples[1]),
        "scope": "local synthetic operational-event SELECT only; not telemetry ingestion or production qualification",
        "ten_million_rows": "NOT_RUN",
        "hundred_million_rows": "NOT_RUN",
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run", action="store_true")
    parser.add_argument(
        "--read-only", action="store_true", help="Re-measure an existing local fixture without writing rows."
    )
    parser.add_argument("--rows", type=int, default=100_000)
    parser.add_argument("--repeats", type=int, default=9)
    parser.add_argument("--work-mem-kb", type=int, default=4_096)
    parser.add_argument("--baseline-ref", default="origin/main")
    parser.add_argument(
        "--candidate", type=QueryCandidate, choices=list(QueryCandidate), default=QueryCandidate.CURRENT
    )
    args = parser.parse_args()
    try:
        options = BenchmarkOptions(args.rows, args.repeats, args.work_mem_kb, args.baseline_ref, args.candidate)
        report = (
            run_benchmark(options, args.read_only)
            if args.run
            else {"schema_version": SCHEMA_VERSION, "result": "NOT_RUN"}
        )
        print(json.dumps(report, sort_keys=True))
        return 0
    except (QueryBenchmarkError, psycopg2.Error, OSError, ValueError, subprocess.SubprocessError):
        print(json.dumps({"schema_version": SCHEMA_VERSION, "result": "FAIL", "error_code": "query_benchmark_failed"}))
        return 1


if __name__ == "__main__":
    sys.exit(main())
