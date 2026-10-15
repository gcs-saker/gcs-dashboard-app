#!/usr/bin/env python3
"""Compare owned search SQL unchanged, including GIN storage/write/maintenance cost."""

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
from event_query_plan import (
    SQL_SOURCE,
    PlanMeasurement,
    QueryBenchmarkError,
    object_mapping,
    owned_sql_literal,
    plan_measurement,
    plan_nodes,
)
from event_search_fixture import (
    SEARCH_EXPRESSIONS,
    WRITE_BATCH_SIZE,
    FixtureProfile,
    SearchIndexVariant,
    append_batch,
    clean_pending,
    initialize_profiles,
    select_variant,
    storage_bytes,
)
from operational_event_query_benchmark import EXPLAIN_PREFIX, BenchmarkOptions, connect_fixture, summary
from psycopg2.extensions import connection as PgConnection

SCHEMA_VERSION = "event-search-index-benchmark-v1"
REPO_ROOT = Path(__file__).resolve().parents[2]
FETCH_LIMIT = 51


@dataclass(frozen=True)
class SearchCase:
    name: str
    term: str
    role: str = "OPERATOR"

    @property
    def groups(self) -> list[str]:
        if self.role == "ADMIN":
            return ["co-a", "co-b", "child-a"]
        return ["co-a", "child-a"] if self.role == "GROUP_ADMIN" else ["co-a"]

    @property
    def parameters(self) -> tuple[object, ...]:
        scope = ("co-a", self.role, "ADMIN", self.role, "co-a")
        return (*scope, *(["%" + self.term.strip().lower() + "%"] * len(SEARCH_EXPRESSIONS)), FETCH_LIMIT)


SEARCH_CASES = (
    SearchCase("rare", "NeedleAlpha"),
    SearchCase("common", "online"),
    SearchCase("missing", "unfindabletoken"),
    SearchCase("one_character", "a"),
    SearchCase("two_characters", "on"),
    SearchCase("korean_short", "임무"),
    SearchCase("korean_long", "장애경보"),
    SearchCase("wildcard_percent", "%"),
    SearchCase("wildcard_underscore", "_"),
    SearchCase("nullable_field", "heartbeat"),
    SearchCase("descendant_scope", "needlealpha", "GROUP_ADMIN"),
    SearchCase("global_scope", "needlealpha", "ADMIN"),
)


def owned_search_sql(source: str) -> tuple[str, str]:
    text = owned_sql_literal(source, "andTextQuery")
    if text.count("?") != len(SEARCH_EXPRESSIONS):
        raise QueryBenchmarkError("search_expression_count_changed")
    expected = [expression + " LIKE ?" for expression in SEARCH_EXPRESSIONS]
    if any(text.count(expression) != 1 for expression in expected):
        raise QueryBenchmarkError("search_expression_contract_changed")
    base = owned_sql_literal(source, "selectBase")
    if base.count("?") != 5 or "c.descendant_group_id = operational_events.group_id" not in base:
        raise QueryBenchmarkError("search_scope_contract_changed")
    suffix = text + owned_sql_literal(source, "orderByOccurredAt") + owned_sql_literal(source, "limit")
    oracle = base.split("WHERE (group_id", 1)[0] + "WHERE group_id = ANY(?)" + suffix
    return (base + suffix).replace("?", "%s"), oracle.replace("?", "%s")


def verified_results(connection: PgConnection, queries: tuple[str, str], case: SearchCase) -> str:
    with connection.cursor() as cursor:
        cursor.execute(queries[0], case.parameters)
        actual = cursor.fetchall()
        cursor.execute(queries[1], (case.groups, *case.parameters[5:]))
        expected = cursor.fetchall()
    if actual != expected or len(actual) > FETCH_LIMIT or any(row[11] not in case.groups for row in actual):
        raise QueryBenchmarkError("search_results_or_scope_changed")
    return hashlib.sha256(json.dumps(actual, default=str).encode()).hexdigest()


def search_measurement(
    connection: PgConnection, query: str, case: SearchCase
) -> tuple[PlanMeasurement, dict[str, object]]:
    with connection.cursor() as cursor:
        cursor.execute(EXPLAIN_PREFIX + query, case.parameters)
        row = cursor.fetchone()
    if row is None:
        raise QueryBenchmarkError("search_plan_missing")
    measurement = plan_measurement(row[0])
    root = object_mapping(row[0][0])
    nodes = plan_nodes(object_mapping(root["Plan"]))
    scans = [node for node in nodes if node.get("Relation Name") == "operational_events"]
    return measurement, {
        "gin_used": any(node.get("Index Name") == "event_text_trgm" for node in nodes),
        "scanned_rows": scan_work(scans, "Actual Rows"),
        "filtered_rows": scan_work(scans, "Rows Removed by Filter"),
    }


def scan_work(scans: list[dict[str, object]], name: str) -> float:
    total = 0.0
    for node in scans:
        values = [node.get(name, 0), node.get("Actual Loops", 0)]
        numbers: list[float] = []
        for value in values:
            if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or value < 0:
                raise QueryBenchmarkError("search_scan_measurement_invalid")
            numbers.append(float(value))
        total += numbers[0] * numbers[1]
    return total


def measure_searches(
    connection: PgConnection, options: BenchmarkOptions, queries: tuple[str, str]
) -> dict[str, object]:
    results: dict[str, object] = {}
    for case in SEARCH_CASES:
        digests = []
        samples: dict[SearchIndexVariant, list[tuple[PlanMeasurement, dict[str, object]]]] = {
            variant: [] for variant in SearchIndexVariant
        }
        for variant in SearchIndexVariant:
            select_variant(connection, variant)
            digests.append(verified_results(connection, queries, case))
        if len(set(digests)) != 1:
            raise QueryBenchmarkError("search_index_results_changed")
        order = list(SearchIndexVariant)
        for iteration in range(options.repeats):
            position = iteration % len(order)
            for variant in order[position:] + order[:position]:
                select_variant(connection, variant)
                samples[variant].append(search_measurement(connection, queries[0], case))
        variants = {
            variant.value: {
                **summary([sample[0] for sample in measurements]),
                "access": [sample[1] for sample in measurements],
            }
            for variant, measurements in samples.items()
        }
        results[case.name] = {"results_equal": True, "variants": variants}
    return results


def measure_writes(
    connection: PgConnection, options: BenchmarkOptions, profiles: list[FixtureProfile]
) -> dict[str, object]:
    samples: dict[SearchIndexVariant, list[dict[str, float | int]]] = {profile.variant: [] for profile in profiles}
    # Warm each durable append path equally; these rows are retained but not timing samples.
    for profile in profiles:
        select_variant(connection, profile.variant)
        append_batch(connection, options.rows + 1)
    for iteration in range(options.repeats):
        order = profiles if iteration % 2 == 0 else list(reversed(profiles))
        for profile in order:
            select_variant(connection, profile.variant)
            first = options.rows + (iteration + 1) * WRITE_BATCH_SIZE + 1
            samples[profile.variant].append(append_batch(connection, first))
    reports: dict[str, object] = {}
    for profile in profiles:
        select_variant(connection, profile.variant)
        durations = sorted(float(sample["duration_ms"]) for sample in samples[profile.variant])
        reports[profile.variant.value] = {
            "index_build_ms": profile.index_build_ms,
            "bytes_before_writes": profile.bytes_before_writes,
            "bytes_after_writes": storage_bytes(connection),
            "insert_commit": {
                "p50_ms": statistics.median(durations),
                "p95_ms": durations[math.ceil(len(durations) * 0.95) - 1],
            },
            "write_samples": samples[profile.variant],
            "pending_cleanup": clean_pending(connection, profile.variant),
            "bytes_after_cleanup": storage_bytes(connection),
        }
    return reports


def run_benchmark(options: BenchmarkOptions) -> dict[str, object]:
    queries = owned_search_sql((REPO_ROOT / SQL_SOURCE).read_text(encoding="utf-8"))
    connection = connect_fixture()
    try:
        profiles = initialize_profiles(connection, options)
        searches = measure_searches(connection, options, queries)
        writes = measure_writes(connection, options, profiles)
        return {
            "schema_version": SCHEMA_VERSION,
            "result": "PASS",
            "rows_per_variant": options.rows,
            "repeats": options.repeats,
            "fetch_limit": FETCH_LIMIT,
            "write_batch_size": WRITE_BATCH_SIZE,
            "warmup_write_rows_per_variant": WRITE_BATCH_SIZE,
            "owned_sql_sha256": hashlib.sha256(queries[0].encode()).hexdigest(),
            "searches": searches,
            "writes": writes,
            "scope": "local synthetic PostgreSQL search/index experiment; unchanged owned SQL; not full audit ingest",
            "performance_gate": "NOT_RUN; measured timing is not a deterministic CI threshold",
            "production_migration": "NOT_RUN",
            "ten_million_rows": "NOT_RUN",
            "hundred_million_rows": "NOT_RUN",
            "limits": "warm cache; rotating variant read order; WAL is cluster-wide; append-only batch cost excludes audit locks/hash and network; cleanup separate from insert timing; generic prepared plans and lock-wait qualification NOT_RUN",
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
        print(json.dumps({"schema_version": SCHEMA_VERSION, "result": "FAIL", "error_code": "search_benchmark_failed"}))
        return 1


if __name__ == "__main__":
    sys.exit(main())
