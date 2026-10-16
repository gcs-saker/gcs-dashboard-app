from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[2]


def test_bootstrap_and_existing_install_use_same_runner_and_migration_directory() -> None:
    compose = yaml.safe_load((ROOT / "deploy/compose/compose.single-node.poc.yml").read_text())
    mounts = compose["services"]["postgres-geo"]["volumes"]
    assert any(
        mount.get("source") == "../postgres/init" and mount.get("read_only") is True
        for mount in mounts
        if isinstance(mount, dict)
    )
    runner = (ROOT / "deploy/postgres/init/002_geo_migrations.sh").read_text()
    wrapper = (ROOT / "scripts/ops/apply_geo_migrations.sh").read_text()
    migration = (ROOT / "deploy/postgres/init/migrations/V001__retention_time_index.sql").read_text()
    assert "GEO_MIGRATION_DIR:-/docker-entrypoint-initdb.d/migrations" in runner
    assert "deploy/postgres/init/002_geo_migrations.sh" in wrapper
    assert "deploy/postgres/init/migrations" in wrapper
    assert "CREATE INDEX CONCURRENTLY IF NOT EXISTS" in migration


def test_runner_has_checksum_lock_deadline_disk_and_invalid_index_guards() -> None:
    runner = (ROOT / "deploy/postgres/init/002_geo_migrations.sh").read_text()
    assert "schema_migrations" in runner and "checksum mismatch" in runner
    assert "pg_advisory_lock" in runner and "pg_advisory_unlock" in runner
    assert "statement_timeout" in runner and "lock_timeout" in runner
    assert "disk preflight failed" in runner and "pg_total_relation_size" in runner
    assert "indisvalid AND i.indisready" in runner
    assert "invalid or incompatible" in runner
    assert "DROP INDEX" not in runner and "rm -rf" not in runner


def test_operational_wrapper_requires_server01_maintenance_and_verified_backup() -> None:
    wrapper = (ROOT / "scripts/ops/apply_geo_migrations.sh").read_text()
    assert "server01-production" in wrapper and "gcs-saker-m2-production" in wrapper
    assert "GCS_MAINTENANCE_WINDOW_APPROVED" in wrapper
    assert "GCS_DB_BACKUP_EVIDENCE" in wrapper and "verify_backup" in wrapper
    assert "postgres-geo container is not healthy" in wrapper
    assert "Server-02" not in wrapper and "55122" not in wrapper
    assert 'case "${remote_dir}"' in wrapper


def test_candidate_index_is_owned_only_by_versioned_geo_migration() -> None:
    migration = ROOT / "deploy/postgres/init/migrations/V001__retention_time_index.sql"
    occurrences = []
    for path in [
        ROOT / "deploy/postgres/init/001_geo_telemetry.sql",
        *sorted((ROOT / "services/auth-policy/src/main/resources/db").rglob("*.sql")),
    ]:
        if "idx_stream_telemetry_points_observed_at_id" in path.read_text(errors="ignore"):
            occurrences.append(path)
    assert occurrences == []
    assert "idx_stream_telemetry_points_observed_at_id" in migration.read_text()
