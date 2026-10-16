#!/usr/bin/env python3
"""Qualify a test-only aggregate rollup, including expected freshness/boundary failures."""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import cast

import psycopg2
from event_query_plan import SQL_SOURCE, PlanMeasurement, QueryBenchmarkError
from event_rollup_fixture import APPEND_LATE_SQL, initialize_rollup, refresh_rollup
from event_rollup_queries import RollupCase, RollupQueries, RollupScope, RollupWindow, owned_rollup_queries, rows_equal
from operational_event_query_benchmark import BenchmarkOptions, connect_fixture, measure, summary
from psycopg2.extensions import connection as PgConnection

REPO_ROOT = Path(__file__).resolve().parents[2]
SCHEMA_VERSION = "operational-rollup-benchmark-v1"
START = datetime(2026, 10, 15, tzinfo=UTC)
CASES = (
    RollupCase("own_all", RollupScope()),
    RollupCase("descendants_all", RollupScope(role="GROUP_ADMIN", allowed_groups=("co-a", "child-a"))),
    RollupCase("global_all", RollupScope(role="ADMIN", allowed_groups=("co-a", "child-a", "co-b"))),
    RollupCase("empty_group", RollupScope(group="empty", allowed_groups=())),
    RollupCase(
        "all_null_minute", RollupScope(), RollupWindow(START, START + timedelta(minutes=1) - timedelta(microseconds=1))
    ),
    RollupCase(
        "aligned_window",
        RollupScope(),
        RollupWindow(START + timedelta(hours=1), START + timedelta(hours=7) - timedelta(microseconds=1)),
    ),
    RollupCase(
        "empty_window", RollupScope(), RollupWindow(START - timedelta(hours=1), START - timedelta(microseconds=1))
    ),
)


def read_rows(connection: PgConnection, statement: str, parameters: tuple[object, ...]) -> list[tuple[object, ...]]:
    with connection.cursor() as cursor:
        cursor.execute(statement, parameters)
        return cast(list[tuple[object, ...]], cursor.fetchall())


def oracle_query(queries: RollupQueries, kind: str, case: RollupCase) -> tuple[str, tuple[object, ...]]:
    raw = queries.raw_metrics if kind == "metrics" else queries.raw_buckets
    statement = raw.split("WHERE", 1)[0] + "WHERE group_id = ANY(%s)"
    parameters: tuple[object, ...] = (list(case.scope.allowed_groups),)
    if case.window is not None:
        statement += queries.time_from.replace("?", "%s") + queries.time_to.replace("?", "%s")
        parameters += (case.window.start, case.window.end)
    if kind == "buckets":
        statement += queries.bucket_suffix
    return statement, parameters


def verify_pair(connection: PgConnection, queries: RollupQueries, kind: str, case: RollupCase) -> None:
    raw, candidate = queries.pair(kind, case)
    actual = read_rows(connection, raw, case.parameters)
    rolled = read_rows(connection, candidate, case.parameters)
    oracle, parameters = oracle_query(queries, kind, case)
    expected = read_rows(connection, oracle, parameters)
    count_columns = (0, 1) if kind == "metrics" else (1, 2)
    exact_counts = len(actual) == len(rolled) and all(
        all(left[index] == right[index] for index in count_columns) for left, right in zip(actual, rolled, strict=True)
    )
    if not exact_counts or not rows_equal(actual, rolled) or not rows_equal(actual, expected):
        raise QueryBenchmarkError("rollup_result_or_scope_changed")
    if (kind == "buckets" and len(rolled) > 1440) or (kind == "metrics" and len(rolled) != 1):
        raise QueryBenchmarkError("rollup_output_bound_changed")


def measure_cases(connection: PgConnection, queries: RollupQueries, options: BenchmarkOptions) -> dict[str, object]:
    results: dict[str, object] = {}
    for case in CASES:
        for kind in ("metrics", "buckets"):
            verify_pair(connection, queries, kind, case)
            pair = queries.pair(kind, case)
            samples: tuple[list[PlanMeasurement], list[PlanMeasurement]] = ([], [])
            for iteration in range(options.repeats):
                for index in (0, 1) if iteration % 2 == 0 else (1, 0):
                    samples[index].append(measure(connection, pair[index], case.parameters))
            results[case.name + "_" + kind] = {
                "results_equal": True,
                "raw": summary(samples[0]),
                "rollup": summary(samples[1]),
            }
    return results


def boundary_probe(connection: PgConnection, queries: RollupQueries) -> bool:
    case = RollupCase(
        "partial", RollupScope(), RollupWindow(START + timedelta(seconds=1), START + timedelta(seconds=2))
    )
    try:
        queries.pair("metrics", case)
    except QueryBenchmarkError as error:
        if str(error) != "rollup_partial_window_unsupported":
            raise
    else:
        raise QueryBenchmarkError("rollup_partial_window_not_rejected")
    full = RollupCase(
        "full_minute", RollupScope(), RollupWindow(START, START + timedelta(minutes=1) - timedelta(microseconds=1))
    )
    raw, _ = queries.pair("metrics", full)
    _, naive = queries.pair("metrics", RollupCase("naive", RollupScope()))
    naive += " AND bucket_start >= %s AND bucket_start <= %s"
    # Explicit negative control: applying bucket filters to arbitrary instants loses valid events.
    if rows_equal(read_rows(connection, raw, case.parameters), read_rows(connection, naive, case.parameters)):
        raise QueryBenchmarkError("rollup_boundary_counterexample_missing")
    return True


def late_event_probe(connection: PgConnection, queries: RollupQueries) -> dict[str, object]:
    case = CASES[0]
    raw, candidate = queries.pair("metrics", case)
    before = read_rows(connection, raw, case.parameters)
    with connection, connection.cursor() as cursor:
        cursor.execute(APPEND_LATE_SQL)
        if cursor.rowcount != 1:
            raise QueryBenchmarkError("rollup_late_fixture_insert_failed")
    fresh = read_rows(connection, raw, case.parameters)
    if rows_equal(before, fresh) or rows_equal(fresh, read_rows(connection, candidate, case.parameters)):
        raise QueryBenchmarkError("rollup_staleness_counterexample_missing")
    refresh = refresh_rollup(connection)
    verify_pair(connection, queries, "metrics", case)
    verify_pair(connection, queries, "buckets", case)
    with connection, connection.cursor() as cursor:
        cursor.execute(APPEND_LATE_SQL)
        if cursor.rowcount != 0:
            raise QueryBenchmarkError("rollup_duplicate_was_not_idempotent")
    verify_pair(connection, queries, "metrics", case)
    return {
        "stale_after_late_append_detected": True,
        "refresh_restores_equivalence": True,
        "duplicate_append_ignored": True,
        **refresh,
    }


def scope_change_probe(connection: PgConnection, queries: RollupQueries) -> bool:
    case = CASES[1]
    raw, _ = queries.pair("metrics", case)
    before = read_rows(connection, raw, case.parameters)
    with connection, connection.cursor() as cursor:
        cursor.execute(
            "DELETE FROM organization_group_closure WHERE ancestor_group_id = 'co-a' AND descendant_group_id = 'child-a'"
        )
        cursor.execute("INSERT INTO organization_group_closure VALUES ('co-b', 'child-a')")
    reduced = RollupCase("after_scope_change", RollupScope(role="GROUP_ADMIN", allowed_groups=("co-a",)))
    verify_pair(connection, queries, "metrics", reduced)
    verify_pair(connection, queries, "buckets", reduced)
    if rows_equal(before, read_rows(connection, raw, reduced.parameters)):
        raise QueryBenchmarkError("rollup_scope_change_fixture_missing")
    return True


def run_benchmark(options: BenchmarkOptions) -> dict[str, object]:
    source = (REPO_ROOT / SQL_SOURCE).read_text(encoding="utf-8")
    queries = owned_rollup_queries(source)
    connection = connect_fixture()
    try:
        fixture = initialize_rollup(connection, options)
        measurements = measure_cases(connection, queries, options)
        boundary = boundary_probe(connection, queries)
        late = late_event_probe(connection, queries)
        scope = scope_change_probe(connection, queries)
        return {
            "schema_version": SCHEMA_VERSION,
            "result": "PASS",
            "rows": options.rows,
            "repeats": options.repeats,
            "owned_source_sha256": hashlib.sha256(source.encode()).hexdigest(),
            "fixture": fixture,
            "measurements": measurements,
            "partial_window_rejected_and_naive_mismatch_detected": boundary,
            "late_event": late,
            "live_scope_change_without_rollup_refresh": scope,
            "production_adoption": "BLOCKED; freshness/partial-window/filter maintenance not implemented",
            "scope": "local synthetic aggregate SELECT + full materialized-view refresh only; not full HTTP or ingestion",
            "limits": "warm cache; numeric averages tolerance 1e-12; counts exact; severity/text filters unsupported; generic prepared plans, concurrent refresh/lock-wait, 10m/100m and production deployment NOT_RUN",
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
        print(json.dumps({"schema_version": SCHEMA_VERSION, "result": "FAIL", "error_code": "rollup_benchmark_failed"}))
        return 1


if __name__ == "__main__":
    sys.exit(main())
