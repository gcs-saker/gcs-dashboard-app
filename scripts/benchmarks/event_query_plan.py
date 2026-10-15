"""Owned SQL extraction and redacted PostgreSQL plan measurements."""

from __future__ import annotations

import math
import re
from dataclasses import asdict, dataclass
from typing import cast

SQL_SOURCE = "services/auth-policy/src/main/kotlin/kr/co/a4ai/gcssaker/authpolicy/infrastructure/persistence/operations/OperationalEventSql.kt"
SCOPE_PARAMETERS = ("co-a", "OPERATOR", "ADMIN", "OPERATOR", "co-a")


class QueryBenchmarkError(RuntimeError):
    """A fixture or query-plan contract failed without exposing SQL or credentials."""


@dataclass(frozen=True)
class PlanMeasurement:
    execution_ms: float
    shared_hit_blocks: int
    shared_read_blocks: int
    temp_read_blocks: int
    temp_written_blocks: int
    sort_spill_nodes: int

    def as_report(self) -> dict[str, object]:
        return cast(dict[str, object], asdict(self))


def stream_metrics_sql(source: str) -> str:
    names = ("selectStreamSessionsBase", "groupByStreamSession")
    fragments = []
    for name in names:
        match = re.search(rf'const val {name}\s*=\s*("""[\s\S]*?"""|"[^"\n]*")', source)
        if match is None:
            raise QueryBenchmarkError("owned_sql_missing")
        literal = match.group(1)
        fragments.append(literal[3:-3] if literal.startswith('"""') else literal[1:-1])
    sql = "\n".join(fragments).strip()
    if sql.count("?") != len(SCOPE_PARAMETERS):
        raise QueryBenchmarkError("owned_sql_parameter_contract_changed")
    return sql.replace("?", "%s")


def object_mapping(value: object) -> dict[str, object]:
    if not isinstance(value, dict) or any(not isinstance(key, str) for key in value):
        raise QueryBenchmarkError("plan_object_invalid")
    return cast(dict[str, object], value)


def plan_measurement(value: object) -> PlanMeasurement:
    if not isinstance(value, list) or len(value) != 1:
        raise QueryBenchmarkError("plan_root_invalid")
    root = object_mapping(value[0])
    plan = object_mapping(root.get("Plan"))
    execution = root.get("Execution Time")
    if (
        isinstance(execution, bool)
        or not isinstance(execution, (int, float))
        or not math.isfinite(execution)
        or execution < 0
    ):
        raise QueryBenchmarkError("plan_duration_invalid")
    return PlanMeasurement(
        float(execution),
        block_count(plan, "Shared Hit Blocks"),
        block_count(plan, "Shared Read Blocks"),
        block_count(plan, "Temp Read Blocks"),
        block_count(plan, "Temp Written Blocks"),
        sort_spills(plan),
    )


def block_count(plan: dict[str, object], name: str) -> int:
    count = plan.get(name, 0)
    if isinstance(count, bool) or not isinstance(count, int) or count < 0:
        raise QueryBenchmarkError("plan_block_count_invalid")
    return count


def sort_spills(plan: dict[str, object]) -> int:
    pending = [plan]
    spills = 0
    for _ in range(1_000):
        if not pending:
            return spills
        node = pending.pop()
        spills += node.get("Sort Space Type") == "Disk"
        children = node.get("Plans", [])
        if not isinstance(children, list):
            raise QueryBenchmarkError("plan_children_invalid")
        pending.extend(object_mapping(child) for child in children)
    raise QueryBenchmarkError("plan_depth_exceeded")
