from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RUNNER = ROOT / "deploy/postgres/bounded_retention_runner.sh"
WRAPPER = ROOT / "scripts/ops/run_bounded_telemetry_retention.sh"


def test_runner_bounds_every_loop_deadline_and_retry() -> None:
    source = RUNNER.read_text()
    for value in ("3650", "1000", "10000", "3600", "2000", "500"):
        assert value in source
    assert "for attempt in 1 2" in source
    assert "zero_progress >= 3" in source
    assert "exit 75" in source and "retention_result=PARTIAL" in source
    assert "TIMESTAMPTZ '${anchor}'" in source


def test_runner_requires_qualified_index_and_separate_transaction_calls() -> None:
    source = RUNNER.read_text()
    assert "schema_migrations" in source and "checksum_sha256" in source
    assert "idx_stream_telemetry_points_observed_at_id" in source
    assert "indisvalid AND i.indisready" in source
    assert "run_batch" in source and "BEGIN;" in source and "COMMIT;" in source
    assert "DROP " not in source and "DELETE FROM" not in source


def test_wrapper_requires_server01_backup_maintenance_and_healthy_database() -> None:
    source = WRAPPER.read_text()
    assert "server01-production" in source and "gcs-saker-m2-production" in source
    assert "GCS_DB_BACKUP_EVIDENCE" in source and "verify_backup" in source
    assert "GCS_MAINTENANCE_WINDOW_APPROVED" in source
    assert "postgres-geo container is not healthy" in source
    assert "Server-02" not in source and "55122" not in source
    assert 'case "${remote_dir}"' in source


def test_candidate_is_not_connected_to_daily_runtime_maintenance() -> None:
    maintenance = (ROOT / "scripts/ops/runtime_maintenance.sh").read_text()
    service = (ROOT / "deploy/systemd/gcs-runtime-maintenance.service").read_text()
    assert "run_bounded_telemetry_retention.sh" not in maintenance
    assert "bounded_retention_runner.sh" not in service
    assert "prune_telemetry_history" in maintenance
