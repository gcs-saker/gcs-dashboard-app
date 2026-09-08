from pathlib import Path

import yaml

REPO_ROOT = Path(__file__).resolve().parents[2]
COMPOSE = REPO_ROOT / "deploy/compose/compose.single-node.poc.yml"


def test_redis_has_bounded_ttl_aware_memory_policy() -> None:
    redis = yaml.safe_load(COMPOSE.read_text(encoding="utf-8"))["services"]["redis"]
    command = redis["command"]

    assert "${REDIS_MAXMEMORY:-384mb}" in command
    assert "${REDIS_MAXMEMORY_POLICY:-volatile-ttl}" in command


def test_auth_policy_has_explicit_jvm_memory_budget() -> None:
    auth_policy = yaml.safe_load(COMPOSE.read_text(encoding="utf-8"))["services"]["auth-policy"]
    options = auth_policy["environment"]["JAVA_TOOL_OPTIONS"]

    assert "-Xms128m" in options
    assert "-Xmx512m" in options
    assert "-XX:MaxMetaspaceSize=192m" in options
    assert "-XX:MaxDirectMemorySize=64m" in options
    assert "-XX:+ExitOnOutOfMemoryError" in options


def test_auth_policy_memory_and_event_pipeline_alerts_are_bounded() -> None:
    rules = (REPO_ROOT / "deploy/monitoring/auth-policy-alerts.yml").read_text(encoding="utf-8")

    assert "AuthPolicyHeapPressure" in rules
    assert "AuthPolicyOldGenerationPressure" in rules
    assert "AuthPolicySseConnectionPressure" in rules
    assert "AuthPolicyOperationalEventBatchSaturation" in rules
    assert "gcs_auth_policy_operational_events_sse_active" in rules


def test_same_host_secondary_turn_is_opt_in() -> None:
    services = yaml.safe_load(COMPOSE.read_text(encoding="utf-8"))["services"]

    assert services["turn-secondary"]["profiles"] == ["same-host-turn-redundancy"]
    assert "turn-secondary" not in services["media-control"]["depends_on"]
    assert services["media-control"]["environment"]["MEDIA_CONTROL_TURN_SECONDARY_URL"] == (
        "${MEDIA_CONTROL_TURN_SECONDARY_URL:-}"
    )


def test_daily_maintenance_is_bounded_and_persistent() -> None:
    service = (REPO_ROOT / "deploy/systemd/gcs-runtime-maintenance.service").read_text(encoding="utf-8")
    timer = (REPO_ROOT / "deploy/systemd/gcs-runtime-maintenance.timer").read_text(encoding="utf-8")
    maintenance = (REPO_ROOT / "scripts/ops/runtime_maintenance.sh").read_text(encoding="utf-8")

    assert "DEPLOYMENT_TARGET=server01-production" in service
    assert "Persistent=true" in timer
    assert "prune_deployment_artifacts.sh" in maintenance
    assert "redis_keys_total=" in maintenance
    assert "prune_telemetry_history" in maintenance
    assert "docker volume prune" not in maintenance


def test_telemetry_retention_is_indexed_and_bounded() -> None:
    migration = (
        REPO_ROOT / "services/auth-policy/src/main/resources/db/postgresql-migration/V19__telemetry_retention.sql"
    ).read_text(encoding="utf-8")

    assert "ix_telemetry_history_recorded_at" in migration
    assert "retention_days < 1 OR retention_days > 3650" in migration
    assert "DELETE FROM telemetry_history" in migration
    assert "gcs_geo.stream_telemetry_points" in migration


def test_media_and_storage_load_tools_have_check_modes() -> None:
    media = (REPO_ROOT / "scripts/benchmarks/media_plane_load.sh").read_text(encoding="utf-8")
    storage = (REPO_ROOT / "scripts/benchmarks/telemetry_storage_audit.sh").read_text(encoding="utf-8")

    assert "MEDIA_LOAD_STAGES" in media
    assert "--hold-seconds" in media
    assert "pg_total_relation_size" in storage
    assert "--check" in media and "--check" in storage
