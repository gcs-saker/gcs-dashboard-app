#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_COMPOSE_FILE = REPO_ROOT / "deploy" / "compose" / "compose.single-node.poc.yml"
DEFAULT_ENV_FILE = REPO_ROOT / "deploy" / "compose" / ".env.single-node.example"
SCHEMA_VERSION = "postgis-runtime-smoke-v1"


@dataclass(frozen=True)
class PostGISSmokeConfig:
    compose_file: Path
    env_file: Path
    service: str
    database: str
    user: str

    def docker_compose_command(self) -> list[str]:
        return [
            "docker",
            "compose",
            "--env-file",
            str(self.env_file),
            "-f",
            str(self.compose_file),
            "--profile",
            "geo",
            "exec",
            "-T",
            self.service,
            "psql",
            "-U",
            self.user,
            "-d",
            self.database,
            "-v",
            "ON_ERROR_STOP=1",
        ]

    def psql_command(self, sql: str) -> list[str]:
        return [
            *self.docker_compose_command(),
            "-X",
            "-q",
            "-t",
            "-A",
            "-c",
            sql,
        ]


POSTGIS_HISTORY_LATEST_SQL = """
INSERT INTO gcs_geo.stream_telemetry_points (
    org_id,
    group_id,
    asset_id,
    stream_id,
    event_id,
    observed_at,
    position,
    altitude_m,
    heading_deg,
    speed_mps,
    battery_percent,
    source_protocol,
    payload_format
) VALUES
(
    'co-a',
    'alpha',
    'drn-01',
    'raw.mobile.front',
    'smoke-history-001',
    now() - interval '2 seconds',
    ST_SetSRID(ST_MakePoint(128.6004, 35.8704), 4326),
    118.0,
    6.0,
    10.5,
    92.0,
    'protobuf',
    'telemetry.v1'
),
(
    'co-a',
    'alpha',
    'drn-01',
    'raw.mobile.front',
    'smoke-history-002',
    now(),
    ST_SetSRID(ST_MakePoint(128.6014, 35.8714), 4326),
    120.0,
    7.0,
    12.5,
    91.0,
    'protobuf',
    'telemetry.v1'
) ON CONFLICT (org_id, group_id, asset_id, event_id) DO NOTHING;
INSERT INTO gcs_geo.stream_telemetry_latest (
    org_id,
    group_id,
    asset_id,
    stream_id,
    event_id,
    observed_at,
    position,
    altitude_m,
    heading_deg,
    speed_mps,
    battery_percent,
    source_protocol,
    payload_format
) VALUES (
    'co-a',
    'alpha',
    'drn-01',
    'raw.mobile.front',
    'smoke-history-002',
    now(),
    ST_SetSRID(ST_MakePoint(128.6014, 35.8714), 4326),
    120.0,
    7.0,
    12.5,
    91.0,
    'protobuf',
    'telemetry.v1'
) ON CONFLICT (org_id, group_id, stream_id) DO UPDATE SET
    event_id = EXCLUDED.event_id,
    observed_at = EXCLUDED.observed_at,
    position = EXCLUDED.position,
    altitude_m = EXCLUDED.altitude_m,
    heading_deg = EXCLUDED.heading_deg,
    speed_mps = EXCLUDED.speed_mps,
    battery_percent = EXCLUDED.battery_percent,
    source_protocol = EXCLUDED.source_protocol,
    payload_format = EXCLUDED.payload_format,
    received_at = now()
RETURNING stream_id;
"""

POSTGIS_LATEST_JSON_SQL = """
SELECT json_build_object(
    'streamId', stream_id,
    'assetId', asset_id,
    'longitude', ST_X(position),
    'latitude', ST_Y(position),
    'altitudeM', altitude_m,
    'headingDeg', heading_deg,
    'speedMps', speed_mps,
    'batteryPercent', battery_percent,
    'sourceProtocol', source_protocol,
    'payloadFormat', payload_format
)::text
FROM gcs_geo.stream_telemetry_latest
WHERE org_id = 'co-a'
  AND group_id = 'alpha'
  AND stream_id = 'raw.mobile.front';
"""

POSTGIS_HISTORY_COUNT_SQL = """
SELECT count(*)::int
FROM gcs_geo.stream_telemetry_points
WHERE org_id = 'co-a'
  AND group_id = 'alpha'
  AND stream_id = 'raw.mobile.front'
  AND event_id IN ('smoke-history-001', 'smoke-history-002');
"""

POSTGIS_VIEWPORT_JSON_SQL = """
SELECT coalesce(json_agg(row_to_json(viewport_rows)), '[]'::json)::text
FROM (
    SELECT stream_id AS "streamId",
           asset_id AS "assetId",
           ST_X(position) AS longitude,
           ST_Y(position) AS latitude,
           observed_at AS "observedAt"
    FROM gcs_geo.stream_telemetry_latest
    WHERE org_id = 'co-a'
      AND group_id = 'alpha'
      AND position && ST_MakeEnvelope(128.55, 35.84, 128.65, 35.9, 4326)
    ORDER BY observed_at DESC
    LIMIT 10
) AS viewport_rows;
"""

POSTGIS_VIEWPORT_EXPLAIN_SQL = """
EXPLAIN (ANALYZE, BUFFERS)
SELECT stream_id, asset_id, ST_X(position) AS longitude, ST_Y(position) AS latitude
FROM gcs_geo.stream_telemetry_latest
WHERE org_id = 'co-a'
  AND group_id = 'alpha'
  AND position && ST_MakeEnvelope(128.55, 35.84, 128.65, 35.9, 4326)
ORDER BY observed_at DESC
LIMIT 10;
"""

POSTGIS_VIEWPORT_EXPLAIN_JSON_SQL = POSTGIS_VIEWPORT_EXPLAIN_SQL.replace(
    "EXPLAIN (ANALYZE, BUFFERS)",
    "EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)",
)

POSTGIS_RUNTIME_SQL = "\n".join(
    [
        POSTGIS_HISTORY_LATEST_SQL.strip(),
        POSTGIS_LATEST_JSON_SQL.strip(),
        POSTGIS_HISTORY_COUNT_SQL.strip(),
        POSTGIS_VIEWPORT_JSON_SQL.strip(),
        POSTGIS_VIEWPORT_EXPLAIN_SQL.strip(),
    ]
)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Run PostGIS runtime smoke against the default docker compose database.")
    parser.add_argument("--check", action="store_true", help="Print the stable command and SQL contract without executing docker.")
    parser.add_argument("--compose-file", type=Path, default=DEFAULT_COMPOSE_FILE)
    parser.add_argument("--env-file", type=Path, default=DEFAULT_ENV_FILE)
    parser.add_argument("--service", default="postgres-geo")
    parser.add_argument("--database", default="gcs_geo")
    parser.add_argument("--user", default="gcs_geo")
    return parser


def main() -> int:
    args = build_parser().parse_args()
    config = PostGISSmokeConfig(
        compose_file=args.compose_file,
        env_file=args.env_file,
        service=args.service,
        database=args.database,
        user=args.user,
    )
    command = config.docker_compose_command()
    if args.check:
        print(
            json.dumps(
                {
                    "schemaVersion": SCHEMA_VERSION,
                    "command": command,
                    "checks": [
                        "postgis_version",
                        "history_append",
                        "latest_upsert_conflict",
                        "latest_selected_stream_read",
                        "bounded_map_query_json",
                        "bounded_map_query_explain_analyze_buffers",
                    ],
                    "sql": POSTGIS_RUNTIME_SQL.strip(),
                },
                ensure_ascii=False,
            )
        )
        return 0

    try:
        runtime = run_runtime(config)
    except RuntimeError as exc:
        runtime = {
            "schemaVersion": SCHEMA_VERSION,
            "passed": False,
            "reason": str(exc),
        }
    print(json.dumps(runtime, ensure_ascii=False))
    return 0 if runtime["passed"] else 1


def run_runtime(config: PostGISSmokeConfig) -> dict[str, Any]:
    postgis_version = run_psql(config, "SELECT postgis_version();")
    upserted_stream = run_psql(config, POSTGIS_HISTORY_LATEST_SQL)
    latest = json.loads(run_psql(config, POSTGIS_LATEST_JSON_SQL))
    history_count = int(run_psql(config, POSTGIS_HISTORY_COUNT_SQL))
    viewport_rows = json.loads(run_psql(config, POSTGIS_VIEWPORT_JSON_SQL))
    explain = json.loads(run_psql(config, POSTGIS_VIEWPORT_EXPLAIN_JSON_SQL))
    plan_summary = summarize_plan(explain)

    passed = (
        bool(postgis_version)
        and upserted_stream == "raw.mobile.front"
        and latest["streamId"] == "raw.mobile.front"
        and latest["assetId"] == "drn-01"
        and history_count >= 2
        and any(row["streamId"] == "raw.mobile.front" for row in viewport_rows)
        and plan_summary["usesSpatialCondition"]
    )
    return {
        "schemaVersion": SCHEMA_VERSION,
        "passed": passed,
        "postgisVersion": postgis_version,
        "historyRowsForSmoke": history_count,
        "latest": latest,
        "viewportRows": viewport_rows,
        "explain": plan_summary,
    }


def run_psql(config: PostGISSmokeConfig, sql: str) -> str:
    result = subprocess.run(
        config.psql_command(sql),
        check=False,
        capture_output=True,
        text=True,
        cwd=REPO_ROOT,
    )
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or result.stdout.strip())
    lines = [line.strip() for line in result.stdout.splitlines() if line.strip()]
    if not lines:
        return ""
    return "\n".join(lines)


def summarize_plan(explain: list[dict[str, Any]]) -> dict[str, Any]:
    root = explain[0]["Plan"]
    nodes = list(flatten_plan(root))
    node_types = [node.get("Node Type") for node in nodes]
    index_names = [node.get("Index Name") for node in nodes if node.get("Index Name")]
    filters = " ".join(
        str(node.get(key, ""))
        for node in nodes
        for key in ("Index Cond", "Filter", "Recheck Cond")
    )
    return {
        "rootNode": root.get("Node Type"),
        "nodeTypes": node_types,
        "indexNames": index_names,
        "usesSpatialCondition": "st_makeenvelope" in filters.lower() or "&&" in filters,
        "sharedHitBlocks": sum(int(node.get("Shared Hit Blocks", 0)) for node in nodes),
        "sharedReadBlocks": sum(int(node.get("Shared Read Blocks", 0)) for node in nodes),
        "executionTimeMs": explain[0].get("Execution Time"),
    }


def flatten_plan(node: dict[str, Any]) -> list[dict[str, Any]]:
    items = [node]
    for child in node.get("Plans", []):
        items.extend(flatten_plan(child))
    return items


if __name__ == "__main__":
    raise SystemExit(main())
