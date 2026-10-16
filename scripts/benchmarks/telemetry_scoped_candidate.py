"""SELECT-only scope-first prototype, never imported by a production service."""

from __future__ import annotations

import re

from event_query_plan import QueryBenchmarkError, owned_sql_literal
from telemetry_prepared_plan import PARAMETER_TYPES, PREPARED_NAME, owned_prepared_queries


def candidate_queries(source: str) -> tuple[str, str]:
    _, oracle = owned_prepared_queries(source)
    base = owned_sql_literal(source, "selectTelemetryBase")
    match = re.search(r"\(\? = ('[^']+') AND EXISTS", base)
    if match is None:
        raise QueryBenchmarkError("scoped_hierarchy_guard_changed")
    hierarchy_role = match.group(1)
    expected = f"""(group_id = ? OR ? = ? OR (? = {hierarchy_role} AND EXISTS (
        SELECT 1 FROM organization_group_closure c
        WHERE c.ancestor_group_id = ? AND c.descendant_group_id = telemetry_latest.group_id )))"""
    if " ".join(base.split("WHERE", 1)[1].split()) != " ".join(expected.split()):
        raise QueryBenchmarkError("scoped_scope_contract_changed")
    projection = base.split("FROM telemetry_latest", 1)[0]
    branch_head = projection + " FROM telemetry_latest WHERE "
    tail = " AND uuid > $6 ORDER BY uuid LIMIT $7"
    global_branch = branch_head + "$2 = $3" + tail
    own_branch = branch_head + "($2 = $3) IS NOT TRUE AND group_id = $1" + tail
    child_scan = branch_head + "group_id = c.descendant_group_id" + tail
    descendant_branch = f"""SELECT scoped.* FROM organization_group_closure c
        JOIN LATERAL ({child_scan}) AS scoped ON TRUE
        WHERE ($2 = $3) IS NOT TRUE AND $4 = {hierarchy_role} AND c.ancestor_group_id = $5
        AND (c.descendant_group_id = $1) IS NOT TRUE"""
    union = f"""SELECT * FROM (({global_branch}) UNION ALL ({own_branch})
        UNION ALL ({descendant_branch})) AS visible ORDER BY uuid LIMIT $7"""
    return f"PREPARE {PREPARED_NAME} ({PARAMETER_TYPES}) AS " + union, oracle
