#!/usr/bin/env python3
"""Measure the owned telemetry keyset SELECT against a deep legacy offset in a local fixture."""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from dataclasses import dataclass
from pathlib import Path

import psycopg2
from event_query_plan import SCOPE_PARAMETERS, PlanMeasurement, QueryBenchmarkError, owned_sql_literal
from operational_event_query_benchmark import (
    FIXTURE_DATABASE,
    BenchmarkOptions,
    connect_fixture,
    measure,
    result_hash,
    summary,
)
from psycopg2.extensions import connection as PgConnection

REPO_ROOT = Path(__file__).resolve().parents[2]
SQL_SOURCE = "services/auth-policy/src/main/kotlin/kr/co/a4ai/gcssaker/authpolicy/infrastructure/persistence/operations/JdbcOperationalReadSql.kt"
SCHEMA_VERSION = "telemetry-keyset-benchmark-v1"
FETCH_LIMIT = 51
SEED_BATCH_SIZE = 1_000


@dataclass(frozen=True)
class SeekQueries:
    offset_sql: str
    seek_sql: str
    offset_parameters: tuple[object, ...]
    seek_parameters: tuple[object, ...]
    skipped_rows: int


def owned_queries(rows: int) -> SeekQueries:
    source = (REPO_ROOT / SQL_SOURCE).read_text(encoding="utf-8")
    base = owned_sql_literal(source, "selectTelemetryBase")
    after = owned_sql_literal(source, "andTelemetryAfterUuid")
    order = owned_sql_literal(source, "orderTelemetryPage")
    skipped = (rows // 5) * 3 // 4
    position = f"device-{skipped * 5:08d}"
    offset = base + order + " OFFSET ?"
    seek = base + after + order
    if base.count("?") != 5 or "OFFSET" in seek.upper() or "> ?" not in after:
        raise QueryBenchmarkError("telemetry_seek_contract_invalid")
    return SeekQueries(
        offset.replace("?", "%s"),
        seek.replace("?", "%s"),
        (*SCOPE_PARAMETERS, FETCH_LIMIT, skipped),
        (*SCOPE_PARAMETERS, position, FETCH_LIMIT),
        skipped,
    )


def initialize_fixture(connection: PgConnection, options: BenchmarkOptions) -> None:
    with connection, connection.cursor() as cursor:
        cursor.execute("SELECT current_database(), to_regclass('telemetry_latest')")
        row = cursor.fetchone()
        if row is None or row[0] != FIXTURE_DATABASE or row[1] is not None:
            raise QueryBenchmarkError("telemetry_fixture_must_be_new")
        cursor.execute("""CREATE TABLE telemetry_latest (
            uuid VARCHAR(128) PRIMARY KEY, event_id VARCHAR(160), group_id VARCHAR(64) NOT NULL,
            latitude DOUBLE PRECISION, longitude DOUBLE PRECISION, altitude DOUBLE PRECISION,
            magnetic_x DOUBLE PRECISION, magnetic_y DOUBLE PRECISION, magnetic_z DOUBLE PRECISION,
            soc VARCHAR(32), phone_battery_soc DOUBLE PRECISION, velocity DOUBLE PRECISION,
            total_distance DOUBLE PRECISION, epoch_time VARCHAR(32), port_distance DOUBLE PRECISION,
            battery_percent DOUBLE PRECISION, heading_deg DOUBLE PRECISION, roll_deg DOUBLE PRECISION,
            pitch_deg DOUBLE PRECISION, yaw_deg DOUBLE PRECISION, link_quality_percent DOUBLE PRECISION,
            observed_at TIMESTAMPTZ, session_id VARCHAR(128), stream_id VARCHAR(128))""")
        cursor.execute(
            """CREATE TABLE IF NOT EXISTS organization_group_closure (ancestor_group_id VARCHAR(64), descendant_group_id VARCHAR(64))"""
        )
        cursor.execute("CREATE INDEX ix_telemetry_latest_group_uuid ON telemetry_latest (group_id, uuid)")
    for first in range(1, options.rows + 1, SEED_BATCH_SIZE):
        with connection, connection.cursor() as cursor:
            cursor.execute(
                """INSERT INTO telemetry_latest (uuid, group_id, latitude, longitude)
                SELECT 'device-' || LPAD(i::text, 8, '0'), CASE WHEN MOD(i, 5) = 0 THEN 'co-a' ELSE 'co-b' END,
                35.0, 128.0 FROM generate_series(%s, %s) AS i""",
                (first, min(first + SEED_BATCH_SIZE - 1, options.rows)),
            )
    with connection, connection.cursor() as cursor:
        cursor.execute("ANALYZE telemetry_latest")
        cursor.execute("SELECT set_config('work_mem', %s, false)", (str(options.work_mem_kb) + "kB",))


def run_benchmark(options: BenchmarkOptions) -> dict[str, object]:
    queries = owned_queries(options.rows)
    connection = connect_fixture()
    try:
        initialize_fixture(connection, options)
        expected = result_hash(connection, queries.offset_sql, queries.offset_parameters)
        if expected != result_hash(connection, queries.seek_sql, queries.seek_parameters):
            raise QueryBenchmarkError("telemetry_page_results_changed")
        samples: tuple[list[PlanMeasurement], list[PlanMeasurement]] = ([], [])
        statements = ((queries.offset_sql, queries.offset_parameters), (queries.seek_sql, queries.seek_parameters))
        for iteration in range(options.repeats):
            for index in (0, 1) if iteration % 2 == 0 else (1, 0):
                samples[index].append(measure(connection, *statements[index]))
        if not all(sample.uuid_range_scan for sample in samples[1]):
            raise QueryBenchmarkError("keyset_range_plan_not_used")
        return {
            "schema_version": SCHEMA_VERSION,
            "result": "PASS",
            "results_equal": True,
            "rows": options.rows,
            "scope_rows": options.rows // 5,
            "skipped_rows": queries.skipped_rows,
            "fetch_limit": FETCH_LIMIT,
            "repeats": options.repeats,
            "offset": summary(samples[0]),
            "keyset": summary(samples[1]),
            "owned_sql_sha256": hashlib.sha256(queries.seek_sql.encode()).hexdigest(),
            "scope": "local synthetic telemetry_latest SELECT only; not write throughput or production qualification",
            "ten_million_rows": "NOT_RUN",
            "hundred_million_rows": "NOT_RUN",
        }
    finally:
        connection.close()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run", action="store_true")
    parser.add_argument("--rows", type=int, default=100_000)
    parser.add_argument("--repeats", type=int, default=9)
    args = parser.parse_args()
    try:
        options = BenchmarkOptions(rows=args.rows, repeats=args.repeats)
        report = run_benchmark(options) if args.run else {"schema_version": SCHEMA_VERSION, "result": "NOT_RUN"}
        print(json.dumps(report, sort_keys=True))
        return 0
    except (QueryBenchmarkError, psycopg2.Error, OSError, ValueError):
        print(
            json.dumps({"schema_version": SCHEMA_VERSION, "result": "FAIL", "error_code": "telemetry_benchmark_failed"})
        )
        return 1


if __name__ == "__main__":
    sys.exit(main())
