"""Explicitly limited, test-only rollup candidate and owned aggregate SQL contracts."""

from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import UTC, datetime
from decimal import Decimal

from event_query_plan import QueryBenchmarkError, owned_sql_literal

ROLLUP_METRICS = """SELECT COALESCE(SUM(event_count), 0) AS total_events,
COALESCE(SUM(total_connections), 0) AS total_connections,
MIN(min_latency_ms) AS min_latency_ms,
SUM(latency_sum) / NULLIF(SUM(latency_count), 0) AS avg_latency_ms,
MAX(max_latency_ms) AS max_latency_ms,
SUM(throughput_sum) / NULLIF(SUM(throughput_count), 0) AS avg_throughput_mbps
FROM event_rollup AS operational_events WHERE """
ROLLUP_BUCKETS = """SELECT bucket_start, SUM(event_count) AS event_count,
COALESCE(SUM(total_connections), 0) AS total_connections,
SUM(latency_sum) / NULLIF(SUM(latency_count), 0) AS avg_latency_ms,
SUM(throughput_sum) / NULLIF(SUM(throughput_count), 0) AS avg_throughput_mbps
FROM event_rollup AS operational_events WHERE """
MATERIALIZE_SQL = """CREATE MATERIALIZED VIEW event_rollup AS
SELECT group_id, DATE_TRUNC('minute', occurred_at) AS bucket_start,
COUNT(1) AS event_count, SUM(connections) AS total_connections,
MIN(latency_ms) AS min_latency_ms, MAX(latency_ms) AS max_latency_ms,
SUM(latency_ms) AS latency_sum, COUNT(latency_ms) AS latency_count,
SUM(throughput_mbps) AS throughput_sum, COUNT(throughput_mbps) AS throughput_count
FROM operational_events GROUP BY group_id, bucket_start"""


@dataclass(frozen=True)
class RollupScope:
    group: str = "co-a"
    role: str = "OPERATOR"
    allowed_groups: tuple[str, ...] = ("co-a",)

    @property
    def parameters(self) -> tuple[object, ...]:
        return (self.group, self.role, "ADMIN", self.role, self.group)


@dataclass(frozen=True)
class RollupWindow:
    start: datetime
    end: datetime

    def __post_init__(self) -> None:
        if any(value.tzinfo is None or value.utcoffset() is None for value in (self.start, self.end)):
            raise QueryBenchmarkError("rollup_window_timezone_missing")
        if self.start > self.end:
            raise QueryBenchmarkError("rollup_window_reversed")

    @property
    def eligible(self) -> bool:
        start, end = self.start.astimezone(UTC), self.end.astimezone(UTC)
        return start.second == 0 and start.microsecond == 0 and end.second == 59 and end.microsecond == 999_999


@dataclass(frozen=True)
class RollupCase:
    name: str
    scope: RollupScope
    window: RollupWindow | None = None

    @property
    def parameters(self) -> tuple[object, ...]:
        if self.window is None:
            return self.scope.parameters
        return (*self.scope.parameters, self.window.start, self.window.end)


@dataclass(frozen=True)
class RollupQueries:
    raw_metrics: str
    raw_buckets: str
    scope_clause: str
    time_from: str
    time_to: str
    bucket_suffix: str

    def pair(self, kind: str, case: RollupCase) -> tuple[str, str]:
        if kind not in {"metrics", "buckets"}:
            raise QueryBenchmarkError("rollup_kind_invalid")
        if case.window is not None and not case.window.eligible:
            raise QueryBenchmarkError("rollup_partial_window_unsupported")
        raw = self.raw_metrics if kind == "metrics" else self.raw_buckets
        candidate = (ROLLUP_METRICS if kind == "metrics" else ROLLUP_BUCKETS) + self.scope_clause
        if case.window is not None:
            raw += self.time_from + self.time_to
            candidate += self.time_from.replace("occurred_at", "bucket_start") + self.time_to.replace(
                "occurred_at", "bucket_start"
            )
        if kind == "buckets":
            raw += self.bucket_suffix
            candidate += self.bucket_suffix
        return raw.replace("?", "%s"), candidate.replace("?", "%s")


def owned_rollup_queries(source: str) -> RollupQueries:
    metrics = owned_sql_literal(source, "selectMetricsBase")
    buckets = owned_sql_literal(source, "selectTimeBucketsBase")
    metric_head, scope = metrics.split("WHERE", 1)
    bucket_head, bucket_scope = buckets.split("WHERE", 1)
    if " ".join(scope.split()) != " ".join(bucket_scope.split()) or scope.count("?") != 5:
        raise QueryBenchmarkError("rollup_scope_contract_changed")
    required = ("COUNT(1)", "COALESCE(SUM(connections), 0)", "AVG(latency_ms)", "AVG(throughput_mbps)")
    if any(fragment not in head for head in (metric_head, bucket_head) for fragment in required):
        raise QueryBenchmarkError("rollup_aggregate_contract_changed")
    if (
        "MIN(latency_ms)" not in metric_head
        or "MAX(latency_ms)" not in metric_head
        or "DATE_TRUNC('minute', occurred_at)" not in bucket_head
    ):
        raise QueryBenchmarkError("rollup_aggregate_contract_changed")
    suffix = owned_sql_literal(source, "groupByTimeBucket")
    time_from, time_to = (owned_sql_literal(source, name) for name in ("andOccurredAtFrom", "andOccurredAtTo"))
    if (
        suffix.strip() != "GROUP BY bucket_start ORDER BY bucket_start ASC LIMIT 1440"
        or time_from.strip() != "AND occurred_at >= ?"
        or time_to.strip() != "AND occurred_at <= ?"
    ):
        raise QueryBenchmarkError("rollup_time_contract_changed")
    return RollupQueries(metrics, buckets, scope, time_from, time_to, suffix)


def rows_equal(actual: list[tuple[object, ...]], expected: list[tuple[object, ...]]) -> bool:
    if len(actual) != len(expected):
        return False
    return all(
        len(left) == len(right) and all(values_equal(a, b) for a, b in zip(left, right, strict=True))
        for left, right in zip(actual, expected, strict=True)
    )


def values_equal(actual: object, expected: object) -> bool:
    if isinstance(actual, bool) or isinstance(expected, bool):
        return False
    if isinstance(actual, int) and isinstance(expected, int):
        return actual == expected
    if isinstance(actual, (int, float, Decimal)) and isinstance(expected, (int, float, Decimal)):
        return (
            math.isfinite(actual)
            and math.isfinite(expected)
            and math.isclose(float(actual), float(expected), rel_tol=1e-12, abs_tol=1e-12)
        )
    return actual == expected
