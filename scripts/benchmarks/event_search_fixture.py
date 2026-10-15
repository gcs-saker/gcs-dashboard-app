"""Disposable PostgreSQL search/index fixtures; not imported by runtime services."""

from __future__ import annotations

import time
from dataclasses import dataclass
from enum import Enum

from event_query_plan import QueryBenchmarkError
from operational_event_query_benchmark import FIXTURE_DATABASE, BenchmarkOptions
from psycopg2 import sql
from psycopg2.extensions import connection as PgConnection

SEARCH_EXPRESSIONS = (
    "LOWER(source)",
    "LOWER(message)",
    "LOWER(category)",
    "LOWER(COALESCE(event_type, ''))",
    "LOWER(COALESCE(source_service, ''))",
    "LOWER(COALESCE(stream_id, ''))",
    "LOWER(COALESCE(connection_id, ''))",
    "LOWER(COALESCE(ice_path, ''))",
    "LOWER(COALESCE(relay_fallback_reason, ''))",
)
WRITE_BATCH_SIZE = 1_000


class SearchIndexVariant(str, Enum):
    BASELINE = "baseline"
    GIN_PENDING = "gin_pending"
    GIN_DIRECT = "gin_direct"

    @property
    def schema(self) -> str:
        return "event_search_" + self.value


@dataclass(frozen=True)
class FixtureProfile:
    variant: SearchIndexVariant
    index_build_ms: float
    bytes_before_writes: int


TABLE_DDL = """CREATE TABLE operational_events (
id VARCHAR(128) PRIMARY KEY, occurred_at TIMESTAMPTZ NOT NULL, severity VARCHAR(32), category VARCHAR(64),
event_type VARCHAR(64), source_service VARCHAR(64), source VARCHAR(128), message VARCHAR(1024),
connections INT, latency_ms BIGINT, throughput_mbps DOUBLE PRECISION, group_id VARCHAR(64) NOT NULL,
stream_id VARCHAR(128), connection_id VARCHAR(128), ice_path VARCHAR(32), relay_fallback_reason VARCHAR(255),
trace_id VARCHAR(64), actor_id VARCHAR(128), operation VARCHAR(128), result VARCHAR(32), error_code VARCHAR(128),
clock_status VARCHAR(32), previous_hash VARCHAR(64), event_hash VARCHAR(64), received_at TIMESTAMPTZ,
time_source VARCHAR(160), clock_drift_ms BIGINT, clock_measured_at TIMESTAMPTZ)"""
INSERT_FIXTURE_SQL = """INSERT INTO operational_events
(id, occurred_at, severity, category, event_type, source_service, source, message, group_id,
connections, latency_ms, throughput_mbps, stream_id, connection_id, ice_path, relay_fallback_reason)
SELECT 'event-' || LPAD(i::text, 9, '0'), TIMESTAMPTZ '2026-10-15 00:00:00+00' + i * INTERVAL '1 millisecond',
'info', 'network', CASE WHEN MOD(i, 13) = 0 THEN NULL ELSE 'heartbeat' END, 'media-control',
CASE WHEN MOD(i, 17) = 0 THEN 'gateway' ELSE 'publisher' END,
CASE WHEN MOD(i, 997) = 0 THEN 'NeedleAlpha 임무 장애경보' ELSE 'online normal connection' END,
CASE MOD(i, 5) WHEN 0 THEN 'co-b' WHEN 1 THEN 'child-a' ELSE 'co-a' END,
1, MOD(i, 100), 23.5, 'stream-' || MOD(i, 100), 'session-' || MOD(i, 100),
CASE WHEN MOD(i, 11) = 0 THEN NULL ELSE 'relay' END,
CASE WHEN MOD(i, 19) = 0 THEN NULL ELSE 'synthetic' END
FROM generate_series(%s, %s) AS i"""


def select_variant(connection: PgConnection, variant: SearchIndexVariant) -> None:
    with connection.cursor() as cursor:
        cursor.execute(sql.SQL("SET search_path TO {}, public").format(sql.Identifier(variant.schema)))


def initialize_profiles(connection: PgConnection, options: BenchmarkOptions) -> list[FixtureProfile]:
    with connection, connection.cursor() as cursor:
        cursor.execute(
            "SELECT current_database(), EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = ANY(%s))",
            ([variant.schema for variant in SearchIndexVariant],),
        )
        row = cursor.fetchone()
        if row is None or row[0] != FIXTURE_DATABASE or row[1]:
            raise QueryBenchmarkError("search_fixture_must_be_new")
        cursor.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
        cursor.execute("CREATE EXTENSION IF NOT EXISTS pgstattuple")
        for variant in SearchIndexVariant:
            cursor.execute(sql.SQL("CREATE SCHEMA {}").format(sql.Identifier(variant.schema)))
    return [initialize_profile(connection, options, variant) for variant in SearchIndexVariant]


def initialize_profile(
    connection: PgConnection, options: BenchmarkOptions, variant: SearchIndexVariant
) -> FixtureProfile:
    select_variant(connection, variant)
    with connection, connection.cursor() as cursor:
        cursor.execute(TABLE_DDL)
        cursor.execute(
            "CREATE TABLE organization_group_closure (ancestor_group_id VARCHAR(64), descendant_group_id VARCHAR(64), PRIMARY KEY (ancestor_group_id, descendant_group_id))"
        )
        cursor.execute(
            "INSERT INTO organization_group_closure VALUES ('co-a', 'co-a'), ('co-a', 'child-a'), ('co-b', 'co-b')"
        )
        cursor.execute(INSERT_FIXTURE_SQL, (1, options.rows))
        cursor.execute("CREATE INDEX event_group_time ON operational_events (group_id, occurred_at)")
        cursor.execute("CREATE INDEX event_group_severity_time ON operational_events (group_id, severity, occurred_at)")
        cursor.execute("CREATE INDEX event_group_stream_time ON operational_events (group_id, stream_id, occurred_at)")
    started = time.perf_counter()
    if variant != SearchIndexVariant.BASELINE:
        expressions = ", ".join(f"({expression}) gin_trgm_ops" for expression in SEARCH_EXPRESSIONS)
        fastupdate = "on" if variant == SearchIndexVariant.GIN_PENDING else "off"
        with connection, connection.cursor() as cursor:
            cursor.execute(
                f"CREATE INDEX event_text_trgm ON operational_events USING GIN ({expressions}) WITH (fastupdate = {fastupdate})"
            )
    build_ms = (time.perf_counter() - started) * 1_000
    with connection, connection.cursor() as cursor:
        cursor.execute("ANALYZE operational_events")
        cursor.execute("SET track_io_timing = on")
        cursor.execute("SELECT set_config('work_mem', %s, false)", (str(options.work_mem_kb) + "kB",))
    return FixtureProfile(variant, build_ms, storage_bytes(connection))


def storage_bytes(connection: PgConnection) -> int:
    with connection.cursor() as cursor:
        cursor.execute("SELECT pg_total_relation_size('operational_events')")
        row = cursor.fetchone()
    if row is None or not isinstance(row[0], int) or row[0] <= 0:
        raise QueryBenchmarkError("search_storage_measurement_invalid")
    return row[0]


def append_batch(connection: PgConnection, first: int) -> dict[str, float | int]:
    with connection, connection.cursor() as cursor:
        cursor.execute("SELECT pg_current_wal_insert_lsn()")
        before = cursor.fetchone()
    if before is None:
        raise QueryBenchmarkError("search_wal_measurement_missing")
    started = time.perf_counter()
    with connection, connection.cursor() as cursor:
        cursor.execute(INSERT_FIXTURE_SQL, (first, first + WRITE_BATCH_SIZE - 1))
        if cursor.rowcount != WRITE_BATCH_SIZE:
            raise QueryBenchmarkError("search_write_count_changed")
    duration = (time.perf_counter() - started) * 1_000
    with connection, connection.cursor() as cursor:
        cursor.execute("SELECT pg_wal_lsn_diff(pg_current_wal_insert_lsn(), %s)::bigint", (before[0],))
        after = cursor.fetchone()
    if after is None or not isinstance(after[0], int) or after[0] < 0:
        raise QueryBenchmarkError("search_wal_measurement_invalid")
    return {"duration_ms": duration, "wal_bytes": after[0], "rows": WRITE_BATCH_SIZE}


def clean_pending(connection: PgConnection, variant: SearchIndexVariant) -> dict[str, float | int]:
    if variant == SearchIndexVariant.BASELINE:
        return {"pending_pages": 0, "pending_tuples": 0, "cleaned_pages": 0, "cleanup_ms": 0.0}
    with connection, connection.cursor() as cursor:
        cursor.execute("SELECT pending_pages, pending_tuples FROM pgstatginindex('event_text_trgm')")
        pending = cursor.fetchone()
        started = time.perf_counter()
        cursor.execute("SELECT gin_clean_pending_list('event_text_trgm')")
        cleaned = cursor.fetchone()
    if pending is None or cleaned is None:
        raise QueryBenchmarkError("search_pending_measurement_missing")
    return {
        "pending_pages": int(pending[0]),
        "pending_tuples": int(pending[1]),
        "cleaned_pages": int(cleaned[0]),
        "cleanup_ms": (time.perf_counter() - started) * 1_000,
    }
