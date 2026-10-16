"""Owned seek SQL and redacted measurements for server-side prepared statements."""

from __future__ import annotations

import math
from dataclasses import dataclass
from enum import Enum
from pathlib import Path
from typing import cast

from event_query_plan import QueryBenchmarkError, object_mapping, owned_sql_literal, plan_measurement
from psycopg2.extensions import connection as PgConnection
from telemetry_keyset_benchmark import SQL_SOURCE

PARAMETER_TYPES = "varchar, varchar, varchar, varchar, varchar, varchar, integer"
PREPARED_NAME = "telemetry_seek_qualification"
EXECUTE_SQL = f"EXECUTE {PREPARED_NAME}(%s, %s, %s, %s, %s, %s, %s)"
EXPLAIN_EXECUTE_SQL = "EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) " + EXECUTE_SQL


class PlanMode(str, Enum):
    AUTO = "auto"
    CUSTOM = "force_custom_plan"
    GENERIC = "force_generic_plan"


@dataclass(frozen=True)
class PlanCase:
    name: str
    group: str
    role: str
    allowed_groups: tuple[str, ...]
    position: str
    fetch_limit: int = 51

    def __post_init__(self) -> None:
        if isinstance(self.fetch_limit, bool) or not 1 <= self.fetch_limit <= 501:
            raise QueryBenchmarkError("prepared_fetch_limit_invalid")

    @property
    def parameters(self) -> tuple[object, ...]:
        return (self.group, self.role, "ADMIN", self.role, self.group, self.position, self.fetch_limit)


def prepared_queries(root: Path) -> tuple[str, str]:
    source = (root / SQL_SOURCE).read_text(encoding="utf-8")
    return owned_prepared_queries(source)


def owned_prepared_queries(source: str) -> tuple[str, str]:
    base = owned_sql_literal(source, "selectTelemetryBase")
    after = owned_sql_literal(source, "andTelemetryAfterUuid")
    order = owned_sql_literal(source, "orderTelemetryPage")
    if base.count("?") != 5 or after.strip() != "AND uuid > ?" or order.strip() != "ORDER BY uuid LIMIT ?":
        raise QueryBenchmarkError("prepared_seek_contract_changed")
    if "c.ancestor_group_id = ?" not in base or "c.descendant_group_id = telemetry_latest.group_id" not in base:
        raise QueryBenchmarkError("prepared_scope_contract_changed")
    if "WHERE (group_id" not in base:
        raise QueryBenchmarkError("prepared_scope_contract_changed")
    owned = base + after + order
    pieces = owned.split("?")
    prepared = pieces[0] + "".join(f"${index}" + piece for index, piece in enumerate(pieces[1:], start=1))
    oracle = base.split("WHERE (group_id", 1)[0] + "WHERE group_id = ANY(%s) AND uuid > %s ORDER BY uuid LIMIT %s"
    return f"PREPARE {PREPARED_NAME} ({PARAMETER_TYPES}) AS " + prepared, oracle


def read_rows(connection: PgConnection, statement: str, parameters: tuple[object, ...]) -> list[tuple[object, ...]]:
    with connection.cursor() as cursor:
        cursor.execute(statement, parameters)
        return cast(list[tuple[object, ...]], cursor.fetchall())


def verify_result(connection: PgConnection, oracle: str, case: PlanCase) -> None:
    actual = read_rows(connection, EXECUTE_SQL, case.parameters)
    expected = read_rows(connection, oracle, (list(case.allowed_groups), case.position, case.fetch_limit))
    if any(len(row) != 24 or not isinstance(row[1], str) or not isinstance(row[14], str) for row in actual):
        raise QueryBenchmarkError("prepared_projection_changed")
    if actual != expected or len(actual) > case.fetch_limit:
        raise QueryBenchmarkError("prepared_result_or_scope_changed")
    identities = [row[1] for row in actual]
    if len(set(identities)) != len(actual) or any(row[14] not in case.allowed_groups for row in actual):
        raise QueryBenchmarkError("prepared_identity_or_scope_changed")


def measure_prepared(connection: PgConnection, case: PlanCase) -> dict[str, object]:
    with connection.cursor() as cursor:
        cursor.execute(EXPLAIN_EXECUTE_SQL, case.parameters)
        row = cursor.fetchone()
    if row is None:
        raise QueryBenchmarkError("prepared_plan_missing")
    measurement = plan_measurement(row[0])
    root = object_mapping(row[0][0])
    planning = root.get("Planning Time")
    if (
        isinstance(planning, bool)
        or not isinstance(planning, (int, float))
        or not math.isfinite(planning)
        or planning < 0
    ):
        raise QueryBenchmarkError("prepared_planning_time_invalid")
    return {**measurement.as_report(), "planning_ms": float(planning)}


def plan_counts(connection: PgConnection) -> dict[str, int]:
    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT generic_plans, custom_plans FROM pg_prepared_statements WHERE name = %s", (PREPARED_NAME,)
        )
        row = cursor.fetchone()
    if row is None or any(isinstance(value, bool) or not isinstance(value, int) or value < 0 for value in row):
        raise QueryBenchmarkError("prepared_counter_invalid")
    return {"generic_plans": row[0], "custom_plans": row[1]}


def validate_mode_counts(mode: PlanMode, counts: dict[str, int]) -> None:
    generic, custom = counts["generic_plans"], counts["custom_plans"]
    if generic + custom == 0 or (mode == PlanMode.GENERIC and (generic == 0 or custom != 0)):
        raise QueryBenchmarkError("prepared_mode_not_exercised")
    if mode == PlanMode.CUSTOM and (custom == 0 or generic != 0):
        raise QueryBenchmarkError("prepared_mode_not_exercised")
