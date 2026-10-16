#!/usr/bin/env python3
"""Compare unchanged seek SQL with a server-scope-first SELECT-only prototype."""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from dataclasses import replace
from pathlib import Path

import psycopg2
from event_query_plan import QueryBenchmarkError
from operational_event_query_benchmark import BenchmarkOptions, connect_fixture
from psycopg2.extensions import connection as PgConnection
from telemetry_keyset_benchmark import SQL_SOURCE
from telemetry_prepared_benchmark import ModeRun, benchmark_cases, initialize_prepared_fixture, run_mode
from telemetry_prepared_plan import (
    EXECUTE_SQL,
    PREPARED_NAME,
    PlanMode,
    owned_prepared_queries,
    read_rows,
    verify_result,
)
from telemetry_scoped_candidate import candidate_queries

REPO_ROOT = Path(__file__).resolve().parents[2]
SCHEMA_VERSION = "telemetry-scoped-candidate-v1"


def compare_modes(
    connection: PgConnection, variants: dict[str, tuple[str, str]], options: BenchmarkOptions
) -> dict[str, object]:
    cases = benchmark_cases(options.rows)
    results: dict[str, dict[str, object]] = {name: {} for name in variants}
    for iteration, mode in enumerate(PlanMode):
        names = list(variants) if iteration % 2 == 0 else list(reversed(variants))
        for name in names:
            results[name][mode.value] = run_mode(connection, variants[name], cases, ModeRun(mode, options.repeats))
    return dict(results)


def sql_boundary_parameters() -> tuple[tuple[object, ...], ...]:
    # SQL equivalence probes, not authenticated API inputs or new authorization rules.
    return (
        ("sparse", None, "ADMIN", "GROUP_ADMIN", "parent", "", 51),
        ("sparse", None, None, "GROUP_ADMIN", "parent", "", 51),
        (None, "OPERATOR", "ADMIN", "GROUP_ADMIN", "parent", "", 51),
        ("dense", "OPERATOR", "ADMIN", "GROUP_ADMIN", "parent", "", 51),
        ("sparse", "ADMIN", "ADMIN", "GROUP_ADMIN", "parent", "", 51),
        ("sparse", "OPERATOR", "ADMIN", None, "parent", "", 51),
    )


def boundary_results(connection: PgConnection, statement: str) -> list[list[tuple[object, ...]]]:
    with connection, connection.cursor() as cursor:
        cursor.execute("SET plan_cache_mode = force_generic_plan")
        cursor.execute(statement)
    results = [read_rows(connection, EXECUTE_SQL, parameters) for parameters in sql_boundary_parameters()]
    with connection, connection.cursor() as cursor:
        cursor.execute(f"DEALLOCATE {PREPARED_NAME}")
    return results


def verify_boundaries(connection: PgConnection, variants: dict[str, tuple[str, str]]) -> int:
    current = boundary_results(connection, variants["current"][0])
    candidate = boundary_results(connection, variants["scoped_union"][0])
    if current != candidate:
        raise QueryBenchmarkError("scoped_sql_boundary_results_changed")
    return len(current)


def verify_live_scope(connection: PgConnection, variants: dict[str, tuple[str, str]], rows: int) -> bool:
    parent = next(case for case in benchmark_cases(rows) if case.name == "wide_parent_front")
    reduced = replace(parent, allowed_groups=tuple(group for group in parent.allowed_groups if group != "child-0"))
    for statement, oracle in variants.values():
        with connection, connection.cursor() as cursor:
            cursor.execute("SET plan_cache_mode = force_generic_plan")
            cursor.execute(statement)
        verify_result(connection, oracle, parent)
        with connection, connection.cursor() as cursor:
            cursor.execute(
                "DELETE FROM organization_group_closure WHERE ancestor_group_id = 'parent' AND descendant_group_id = 'child-0'"
            )
            if cursor.rowcount != 1:
                raise QueryBenchmarkError("scoped_fixture_reparent_failed")
        verify_result(connection, oracle, reduced)
        with connection, connection.cursor() as cursor:
            cursor.execute("INSERT INTO organization_group_closure VALUES ('parent', 'child-0')")
            cursor.execute(f"DEALLOCATE {PREPARED_NAME}")
    return True


def run_benchmark(options: BenchmarkOptions) -> dict[str, object]:
    source = (REPO_ROOT / SQL_SOURCE).read_text(encoding="utf-8")
    variants = {"current": owned_prepared_queries(source), "scoped_union": candidate_queries(source)}
    connection = connect_fixture()
    try:
        fixture = initialize_prepared_fixture(connection, options)
        measurements = compare_modes(connection, variants, options)
        boundaries = verify_boundaries(connection, variants)
        live_scope = verify_live_scope(connection, variants, options.rows)
        return {
            "schema_version": SCHEMA_VERSION,
            "result": "PASS",
            "fixture": fixture,
            "repeats": options.repeats,
            "sql_sha256": {name: hashlib.sha256(pair[0].encode()).hexdigest() for name, pair in variants.items()},
            "measurements": measurements,
            "sql_boundary_cases_equal": boundaries,
            "live_scope_rechecked": live_scope,
            "production_adoption": "NOT_RUN; compare regressions and pgJDBC/pool behavior before any runtime change",
            "scope": "local synthetic SELECT-only prototype with unchanged owned role/group inputs and projection",
            "limits": "warm cache; rotated variant/mode case order; per-descendant work depends on group count x limit; closure identities must be unique; SQL null/mismatched parameters are not authorized API inputs; pgJDBC, ingestion, concurrent reparenting, 10m/100m and deployment NOT_RUN",
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
        print(json.dumps({"schema_version": SCHEMA_VERSION, "result": "FAIL", "error_code": "scoped_benchmark_failed"}))
        return 1


if __name__ == "__main__":
    sys.exit(main())
