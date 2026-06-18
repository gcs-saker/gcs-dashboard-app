#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import subprocess
from dataclasses import dataclass
from pathlib import Path


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


POSTGIS_RUNTIME_SQL = """
SELECT postgis_version();
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
    'smoke-001',
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
    received_at = now();
EXPLAIN (ANALYZE, BUFFERS)
SELECT stream_id, asset_id, ST_X(position) AS longitude, ST_Y(position) AS latitude
FROM gcs_geo.stream_telemetry_latest
WHERE org_id = 'co-a'
  AND group_id = 'alpha'
  AND position && ST_MakeEnvelope(128.55, 35.84, 128.65, 35.9, 4326)
ORDER BY observed_at DESC
LIMIT 10;
"""


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Run PostGIS runtime smoke against docker compose geo profile.")
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
                        "latest_upsert_conflict",
                        "bounded_map_query_explain_analyze_buffers",
                    ],
                    "sql": POSTGIS_RUNTIME_SQL.strip(),
                },
                ensure_ascii=False,
            )
        )
        return 0

    result = subprocess.run(
        [*command, "-c", POSTGIS_RUNTIME_SQL],
        check=False,
        text=True,
    )
    return result.returncode


if __name__ == "__main__":
    raise SystemExit(main())
