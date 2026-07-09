from pathlib import Path
import json
import subprocess
import sys

import yaml


REPO_ROOT = Path(__file__).resolve().parents[2]
SINGLE_NODE_COMPOSE_FILE = REPO_ROOT / "deploy" / "compose" / "compose.single-node.poc.yml"
POSTGIS_INIT_SQL = REPO_ROOT / "deploy" / "postgres" / "init" / "001_geo_telemetry.sql"
POSTGIS_DOC = REPO_ROOT / "docs" / "architecture" / "GCS-Saker_M8_postgis_bounded_context.md"
POSTGIS_RUNTIME_SMOKE = REPO_ROOT / "scripts" / "postgis_runtime_smoke.py"


def load_yaml(path: Path) -> dict:
    with path.open("r", encoding="utf-8") as file:
        return yaml.safe_load(file)


def test_default_runtime_mounts_postgis_init_scripts_read_only() -> None:
    compose = load_yaml(SINGLE_NODE_COMPOSE_FILE)
    postgres = compose["services"]["postgres-geo"]

    assert "profiles" not in postgres
    assert postgres["image"] == "postgis/postgis:16-3.4"
    assert {
        "type": "bind",
        "source": "../postgres/init",
        "target": "/docker-entrypoint-initdb.d",
        "read_only": True,
    } in postgres["volumes"]


def test_postgis_schema_separates_history_and_latest_read_model() -> None:
    sql = POSTGIS_INIT_SQL.read_text(encoding="utf-8")

    assert "CREATE EXTENSION IF NOT EXISTS postgis" in sql
    assert "CREATE TABLE IF NOT EXISTS telemetry_realtime" in sql
    assert "CREATE SCHEMA IF NOT EXISTS gcs_geo" in sql
    assert "CREATE TABLE IF NOT EXISTS gcs_geo.stream_telemetry_points" in sql
    assert "CREATE TABLE IF NOT EXISTS gcs_geo.stream_telemetry_latest" in sql
    assert "PRIMARY KEY (org_id, group_id, stream_id)" in sql
    assert "UNIQUE (org_id, group_id, asset_id, event_id)" in sql


def test_postgis_schema_uses_spatial_and_latest_indexes() -> None:
    sql = POSTGIS_INIT_SQL.read_text(encoding="utf-8")

    assert "USING GIST (position)" in sql
    assert "idx_stream_telemetry_points_group_time" in sql
    assert "idx_stream_telemetry_points_stream_latest" in sql
    assert "idx_stream_telemetry_latest_position_gist" in sql
    assert "idx_stream_telemetry_latest_group_asset" not in sql


def test_postgis_schema_documents_index_friendly_query_contracts() -> None:
    sql = POSTGIS_INIT_SQL.read_text(encoding="utf-8")

    assert "stream_telemetry_latest primary key" in sql
    assert "position && ST_MakeEnvelope" in sql
    assert "ORDER BY observed_at DESC" in sql
    assert "LIMIT $7" in sql


def test_postgis_bounded_context_doc_records_query_tuning_reasoning() -> None:
    doc = POSTGIS_DOC.read_text(encoding="utf-8")

    assert "PostgreSQL/PostGIS primary store" in doc
    assert "Redis 또는 Dragonfly" in doc
    assert "기본 single-node 배포는 PostgreSQL/PostGIS + Redis" in doc
    assert "EXPLAIN (ANALYZE, BUFFERS, WAL)" in doc
    assert "primary key lookup" in doc
    assert "GiST spatial index" in doc


def test_postgis_runtime_smoke_exposes_real_container_execution_contract() -> None:
    result = subprocess.run(
        [sys.executable, str(POSTGIS_RUNTIME_SMOKE), "--check"],
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    payload = json.loads(result.stdout)
    assert payload["schemaVersion"] == "postgis-runtime-smoke-v1"
    assert payload["command"][:3] == ["docker", "compose", "--env-file"]
    assert "postgres-geo" in payload["command"]
    assert "postgis_version" in payload["checks"]
    assert "history_append" in payload["checks"]
    assert "latest_selected_stream_read" in payload["checks"]
    assert "bounded_map_query_json" in payload["checks"]
    assert "EXPLAIN (ANALYZE, BUFFERS, WAL)" in payload["sql"]
    assert "bounded_map_query_explain_analyze_buffers_wal" in payload["checks"]
    assert "position && ST_MakeEnvelope" in payload["sql"]
    assert "INSERT INTO gcs_geo.stream_telemetry_points" in payload["sql"]
    assert "ON CONFLICT (org_id, group_id, stream_id) DO UPDATE" in payload["sql"]
    assert "json_build_object" in payload["sql"]
