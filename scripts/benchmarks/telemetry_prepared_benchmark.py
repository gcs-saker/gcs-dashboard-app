#!/usr/bin/env python3
"""Qualify unchanged telemetry seek SQL under real PostgreSQL prepared-plan modes."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import statistics
import sys
from dataclasses import dataclass
from pathlib import Path

import psycopg2
from event_query_plan import QueryBenchmarkError
from operational_event_query_benchmark import FIXTURE_DATABASE, BenchmarkOptions, connect_fixture
from psycopg2.extensions import connection as PgConnection
from telemetry_keyset_benchmark import initialize_fixture
from telemetry_prepared_plan import (
    EXECUTE_SQL,
    PREPARED_NAME,
    PlanCase,
    PlanMode,
    measure_prepared,
    plan_counts,
    prepared_queries,
    read_rows,
    validate_mode_counts,
    verify_result,
)

REPO_ROOT = Path(__file__).resolve().parents[2]
SCHEMA_VERSION = "telemetry-prepared-benchmark-v1"
FIXTURE_SCHEMA = "telemetry_prepared_benchmark"
WARMUP_EXECUTIONS = 6
CHILD_COUNT = 32


@dataclass(frozen=True)
class ModeRun:
    mode: PlanMode
    repeats: int


def benchmark_cases(rows: int) -> tuple[PlanCase, ...]:
    position = f"device-{rows * 3 // 4:08d}"
    children = tuple(f"child-{index}" for index in range(CHILD_COUNT))
    all_groups = ("dense", "sparse", *children)
    return (
        PlanCase("dense_front", "dense", "OPERATOR", ("dense",), ""),
        PlanCase("sparse_front", "sparse", "OPERATOR", ("sparse",), ""),
        PlanCase("wide_parent_front", "parent", "GROUP_ADMIN", children, ""),
        PlanCase("global_front", "sparse", "ADMIN", all_groups, ""),
        PlanCase("empty_scope", "empty", "OPERATOR", (), ""),
        PlanCase("dense_deep", "dense", "OPERATOR", ("dense",), position),
        PlanCase("sparse_deep", "sparse", "OPERATOR", ("sparse",), position),
        PlanCase("wide_parent_deep", "parent", "GROUP_ADMIN", children, position),
        PlanCase("narrow_parent_deep", "dense", "GROUP_ADMIN", ("dense", "child-0", "child-1"), position),
        PlanCase("end_cursor", "sparse", "OPERATOR", ("sparse",), "device-99999999"),
        PlanCase("minimum_fetch", "sparse", "OPERATOR", ("sparse",), "", 1),
        PlanCase("maximum_fetch", "dense", "OPERATOR", ("dense",), position, 501),
    )


def initialize_prepared_fixture(connection: PgConnection, options: BenchmarkOptions) -> dict[str, int]:
    with connection, connection.cursor() as cursor:
        cursor.execute("SELECT current_database(), to_regnamespace(%s)", (FIXTURE_SCHEMA,))
        row = cursor.fetchone()
        if row is None or row[0] != FIXTURE_DATABASE or row[1] is not None:
            raise QueryBenchmarkError("prepared_fixture_must_be_new")
        cursor.execute("CREATE SCHEMA telemetry_prepared_benchmark")
        # Omit public: older benchmark tables must not resolve inside this new fixture.
        cursor.execute("SET search_path TO telemetry_prepared_benchmark")
    initialize_fixture(connection, options)
    with connection, connection.cursor() as cursor:
        cursor.execute("""UPDATE telemetry_latest SET group_id = CASE
            WHEN MOD(SUBSTRING(uuid FROM 8)::int, 1000) = 0 THEN 'sparse'
            WHEN MOD(SUBSTRING(uuid FROM 8)::int, 10) = 0 THEN 'child-' || MOD(SUBSTRING(uuid FROM 8)::int / 10, 32)
            ELSE 'dense' END""")
        cursor.execute(
            "CREATE UNIQUE INDEX closure_ancestor_descendant ON organization_group_closure (ancestor_group_id, descendant_group_id)"
        )
        cursor.execute(
            "INSERT INTO organization_group_closure SELECT 'parent', 'child-' || i FROM generate_series(0, 31) i"
        )
        cursor.execute(
            "INSERT INTO organization_group_closure VALUES ('dense', 'dense'), ('dense', 'child-0'), ('dense', 'child-1'), ('sparse', 'sparse')"
        )
        cursor.execute("ANALYZE telemetry_latest")
        cursor.execute("ANALYZE organization_group_closure")
        cursor.execute("SELECT COUNT(*), COUNT(*) FILTER (WHERE group_id = 'sparse') FROM telemetry_latest")
        counts = cursor.fetchone()
    if counts is None or counts[0] != options.rows or counts[1] != options.rows // 1000:
        raise QueryBenchmarkError("prepared_fixture_distribution_changed")
    return {"rows": counts[0], "sparse_rows": counts[1], "descendant_groups": CHILD_COUNT}


def summarize(samples: list[dict[str, object]]) -> dict[str, object]:
    if not samples:
        raise QueryBenchmarkError("prepared_samples_empty")
    execution = sorted(sample_duration(sample, "execution_ms") for sample in samples)
    planning = sorted(sample_duration(sample, "planning_ms") for sample in samples)
    return {
        "p50_ms": statistics.median(execution),
        "p95_ms": execution[math.ceil(len(execution) * 0.95) - 1],
        "planning_p50_ms": statistics.median(planning),
        "samples": samples,
    }


def sample_duration(sample: dict[str, object], name: str) -> float:
    value = sample.get(name)
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or value < 0:
        raise QueryBenchmarkError("prepared_duration_invalid")
    return float(value)


def run_mode(
    connection: PgConnection, queries: tuple[str, str], cases: tuple[PlanCase, ...], options: ModeRun
) -> dict[str, object]:
    mode, repeats = options.mode, options.repeats
    with connection, connection.cursor() as cursor:
        cursor.execute("SELECT set_config('plan_cache_mode', %s, false)", (mode.value,))
        cursor.execute(queries[0])
    for index in range(WARMUP_EXECUTIONS):
        read_rows(connection, EXECUTE_SQL, cases[index % len(cases)].parameters)
    warm_counts = plan_counts(connection)
    for case in cases:
        verify_result(connection, queries[1], case)
    samples: dict[str, list[dict[str, object]]] = {case.name: [] for case in cases}
    for iteration in range(repeats):
        start = iteration % len(cases)
        for case in cases[start:] + cases[:start]:
            samples[case.name].append(measure_prepared(connection, case))
    counts = plan_counts(connection)
    validate_mode_counts(mode, counts)
    with connection, connection.cursor() as cursor:
        cursor.execute(f"DEALLOCATE {PREPARED_NAME}")
    return {
        "results_equal": True,
        "warmup_counts": warm_counts,
        "final_counts": counts,
        "cases": {name: summarize(values) for name, values in samples.items()},
    }


def run_benchmark(options: BenchmarkOptions) -> dict[str, object]:
    queries = prepared_queries(REPO_ROOT)
    cases = benchmark_cases(options.rows)
    connection = connect_fixture()
    try:
        fixture = initialize_prepared_fixture(connection, options)
        modes = {mode.value: run_mode(connection, queries, cases, ModeRun(mode, options.repeats)) for mode in PlanMode}
        return {
            "schema_version": SCHEMA_VERSION,
            "result": "PASS",
            "repeats": options.repeats,
            "fixture": fixture,
            "owned_prepared_sql_sha256": hashlib.sha256(queries[0].encode()).hexdigest(),
            "modes": modes,
            "warmup_executions_per_mode": WARMUP_EXECUTIONS,
            "scope": "local synthetic SQL PREPARE/EXECUTE only; not a pgJDBC transport or production SLO",
            "limits": "warm cache; mode order auto/custom/generic; rotating case order; timing not CI threshold; production JDBC configuration/generic-plan adoption/10m/100m NOT_RUN",
        }
    finally:
        # Closing this owned session also releases any prepared statement after a failed mode.
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
            json.dumps({"schema_version": SCHEMA_VERSION, "result": "FAIL", "error_code": "prepared_benchmark_failed"})
        )
        return 1


if __name__ == "__main__":
    sys.exit(main())
