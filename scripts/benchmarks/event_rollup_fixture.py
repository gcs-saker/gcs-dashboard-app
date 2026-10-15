"""New local-only fixture and bounded materialized-view maintenance measurements."""

from __future__ import annotations

import time

from event_query_plan import QueryBenchmarkError
from event_rollup_queries import MATERIALIZE_SQL
from operational_event_query_benchmark import FIXTURE_DATABASE, BenchmarkOptions
from psycopg2.extensions import connection as PgConnection

FIXTURE_SCHEMA = "event_rollup_benchmark"
REFRESH_SQL = "REFRESH MATERIALIZED VIEW event_rollup"
APPEND_LATE_SQL = """INSERT INTO operational_events VALUES
('late-fixture-event', TIMESTAMPTZ '2026-10-15 00:02:03+00', 'co-a', 19, 999, 7.25)
ON CONFLICT (id) DO NOTHING"""


def initialize_rollup(connection: PgConnection, options: BenchmarkOptions) -> dict[str, float | int]:
    with connection, connection.cursor() as cursor:
        cursor.execute("SELECT current_database(), to_regnamespace(%s)", (FIXTURE_SCHEMA,))
        row = cursor.fetchone()
        if row is None or row[0] != FIXTURE_DATABASE or row[1] is not None:
            raise QueryBenchmarkError("rollup_fixture_must_be_new")
        cursor.execute("CREATE SCHEMA event_rollup_benchmark")
        cursor.execute("SET search_path TO event_rollup_benchmark, public")
        cursor.execute("SET TIME ZONE 'UTC'")
        cursor.execute("""CREATE TABLE operational_events (
            id VARCHAR(128) PRIMARY KEY, occurred_at TIMESTAMPTZ NOT NULL, group_id VARCHAR(64) NOT NULL,
            connections INT, latency_ms BIGINT, throughput_mbps DOUBLE PRECISION)""")
        cursor.execute("""CREATE TABLE organization_group_closure (ancestor_group_id VARCHAR(64),
            descendant_group_id VARCHAR(64), PRIMARY KEY (ancestor_group_id, descendant_group_id))""")
        cursor.execute(
            "INSERT INTO organization_group_closure VALUES ('co-a', 'co-a'), ('co-a', 'child-a'), ('co-b', 'co-b')"
        )
        cursor.execute(
            """INSERT INTO operational_events SELECT 'event-' || i,
            TIMESTAMPTZ '2026-10-15 00:00:00+00' + i * INTERVAL '1 second',
            CASE WHEN MOD(i, 5) = 0 THEN 'co-b' WHEN MOD(i, 11) = 0 THEN 'child-a' ELSE 'co-a' END,
            CASE WHEN i < 60 OR MOD(i, 17) = 0 THEN NULL ELSE MOD(i, 7) END,
            CASE WHEN i < 60 OR MOD(i, 13) = 0 THEN NULL ELSE MOD(i, 100) END,
            CASE WHEN i < 60 OR MOD(i, 19) = 0 THEN NULL ELSE MOD(i, 25) * 0.25 END
            FROM generate_series(1, %s) AS i""",
            (options.rows,),
        )
        cursor.execute("CREATE INDEX event_group_time ON operational_events (group_id, occurred_at)")
        cursor.execute("ANALYZE operational_events")
        cursor.execute("SELECT set_config('work_mem', %s, false)", (str(options.work_mem_kb) + "kB",))
    started = time.perf_counter()
    with connection, connection.cursor() as cursor:
        cursor.execute(MATERIALIZE_SQL)
        cursor.execute("CREATE UNIQUE INDEX event_rollup_group_minute ON event_rollup (group_id, bucket_start)")
        cursor.execute("ANALYZE event_rollup")
    return {"build_ms": (time.perf_counter() - started) * 1_000, **rollup_storage(connection)}


def rollup_storage(connection: PgConnection) -> dict[str, int]:
    with connection.cursor() as cursor:
        cursor.execute("SELECT COUNT(*), pg_total_relation_size('event_rollup') FROM event_rollup")
        row = cursor.fetchone()
    if row is None or any(isinstance(value, bool) or not isinstance(value, int) or value < 0 for value in row):
        raise QueryBenchmarkError("rollup_storage_invalid")
    return {"rollup_rows": row[0], "rollup_bytes": row[1]}


def refresh_rollup(connection: PgConnection) -> dict[str, float | int]:
    started = time.perf_counter()
    with connection, connection.cursor() as cursor:
        cursor.execute(REFRESH_SQL)
    return {"refresh_ms": (time.perf_counter() - started) * 1_000, **rollup_storage(connection)}
