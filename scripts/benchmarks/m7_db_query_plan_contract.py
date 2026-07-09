#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from typing import Final


SCHEMA_VERSION: Final = "m7-db-query-plan-contract-v1"


@dataclass(frozen=True)
class QueryPlanTarget:
    name: str
    purpose: str
    expected_access: str
    explain_sql: str


QUERY_PLAN_TARGETS: Final = (
    QueryPlanTarget(
        name="operational_events_keyset_page",
        purpose="이벤트 로그 긴 목록을 offset 없이 커서 기반으로 조회한다.",
        expected_access="ix_operational_events_group_occurred 또는 ix_operational_events_group_severity_occurred range scan",
        explain_sql="""
EXPLAIN ANALYZE
SELECT id, occurred_at, severity, category, source, message,
       connections, latency_ms, throughput_mbps, group_id
FROM operational_events
WHERE group_id = 'co-a'
  AND (occurred_at < '2026-06-01 00:10:00' OR (occurred_at = '2026-06-01 00:10:00' AND id < 'ops-network-001'))
ORDER BY occurred_at DESC, id DESC
LIMIT 51;
""".strip(),
    ),
    QueryPlanTarget(
        name="operational_events_metrics",
        purpose="운영 그래프용 연결 수/RTT/처리량을 DB aggregate로 계산한다.",
        expected_access="group/time 조건이 있으면 group occurred index range scan, 전체 row materialization 금지",
        explain_sql="""
EXPLAIN ANALYZE
SELECT COUNT(1) AS total_events,
       COALESCE(SUM(connections), 0) AS total_connections,
       MIN(latency_ms) AS min_latency_ms,
       AVG(latency_ms) AS avg_latency_ms,
       MAX(latency_ms) AS max_latency_ms,
       AVG(throughput_mbps) AS avg_throughput_mbps
FROM operational_events
WHERE group_id = 'co-a'
  AND occurred_at >= '2026-06-01 00:00:00'
  AND occurred_at <= '2026-06-01 23:59:59';
""".strip(),
    ),
    QueryPlanTarget(
        name="operational_events_severity_counts",
        purpose="이벤트 로그 강도별 count를 DB group by로 계산한다.",
        expected_access="group/time range scan 후 severity group, hot path temporary disk table 금지",
        explain_sql="""
EXPLAIN ANALYZE
SELECT severity, COUNT(1) AS total_events
FROM operational_events
WHERE group_id = 'co-a'
  AND occurred_at >= '2026-06-01 00:00:00'
  AND occurred_at <= '2026-06-01 23:59:59'
GROUP BY severity
ORDER BY severity;
""".strip(),
    ),
    QueryPlanTarget(
        name="telemetry_latest_lookup",
        purpose="선택 스트림 GPS/telemetry latest를 단일 index lookup으로 조회한다.",
        expected_access="ix_telemetry_latest_group_uuid 또는 uuid primary/unique lookup",
        explain_sql="""
EXPLAIN ANALYZE
SELECT uuid, latitude, longitude, altitude, velocity, group_id
FROM telemetry_latest
WHERE group_id = 'co-a'
  AND uuid = 'raw.sample.front'
LIMIT 1;
""".strip(),
    ),
)


def build_report() -> dict[str, object]:
    return {
        "schemaVersion": SCHEMA_VERSION,
        "targets": [
            {
                "name": target.name,
                "purpose": target.purpose,
                "expectedAccess": target.expected_access,
                "explainSql": target.explain_sql,
            }
            for target in QUERY_PLAN_TARGETS
        ],
        "operatorNotes": [
            "운영 DB 실행 전 backup/staging에서 먼저 확인한다.",
            "EXPLAIN ANALYZE 결과의 actual rows, loops, key, filesort, temporary table을 기록한다.",
            "handler read, Created_tmp_disk_tables, slow query log를 전후 비교한다.",
        ],
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Print M7 DB query plan contract.")
    parser.add_argument("--check", action="store_true", help="Print contract JSON without connecting to a database.")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if args.check:
        print(json.dumps(build_report(), ensure_ascii=False, indent=2, sort_keys=True))
        return 0
    for target in QUERY_PLAN_TARGETS:
        print(f"-- {target.name}: {target.purpose}")
        print(target.explain_sql)
        print()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
