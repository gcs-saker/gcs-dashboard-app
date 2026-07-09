from __future__ import annotations

from pathlib import Path

import yaml

REPO_ROOT = Path(__file__).resolve().parents[2]
STATUS_FILE = REPO_ROOT / "docs" / "architecture" / "GCS-Saker_runtime_stack_status.yml"
COMPOSE_FILE = REPO_ROOT / "deploy" / "compose" / "compose.single-node.poc.yml"
NGINX_CONFIG = REPO_ROOT / "deploy" / "nginx" / "single-node.poc.conf"

ALLOWED_STATUSES = {
    "active",
    "profile",
    "runtime-validated-profile",
    "synthetic-benchmarked",
    "contract",
    "prototype",
    "deferred",
}


def load_yaml(path: Path) -> dict:
    with path.open("r", encoding="utf-8") as file:
        return yaml.safe_load(file)


def test_runtime_stack_status_file_uses_explicit_completion_states() -> None:
    status = load_yaml(STATUS_FILE)

    assert status["schemaVersion"] == "gcs-saker-runtime-stack-status-v1"
    assert set(status["statusLegend"]) == ALLOWED_STATUSES
    assert status["stacks"], "runtime stack status must list tracked stack decisions"

    for name, entry in status["stacks"].items():
        assert entry["status"] in ALLOWED_STATUSES, f"{name} has unsupported status"
        assert isinstance(entry["issue"], int), f"{name} must reference a GitHub issue number"
        assert entry["evidence"], f"{name} must list code or document evidence"
        assert entry["nextGate"], f"{name} must describe the next promotion gate"


def test_active_runtime_services_are_backed_by_default_compose_services() -> None:
    status = load_yaml(STATUS_FILE)
    compose = load_yaml(COMPOSE_FILE)
    services = compose["services"]

    for name, entry in status["stacks"].items():
        if entry["status"] != "active":
            continue
        runtime = entry.get("runtime", {})
        compose_service = runtime.get("composeService")
        compose_services = runtime.get("composeServices", [])
        expected_services = [compose_service] if compose_service else compose_services

        assert expected_services, f"{name} is active but has no compose service evidence"
        for service in expected_services:
            assert service in services, f"{name} active service {service} is missing from default compose"
            assert "profiles" not in services[service], f"{name} active service {service} must not need a profile"


def test_active_ingress_routes_are_visible_in_nginx_contract() -> None:
    status = load_yaml(STATUS_FILE)
    nginx = NGINX_CONFIG.read_text(encoding="utf-8")

    for name, entry in status["stacks"].items():
        if entry["status"] != "active":
            continue
        for route in entry.get("runtime", {}).get("ingressRoutes", []):
            if route == "/graphql":
                assert "location = /graphql" in nginx or "location /graphql" in nginx
                continue
            assert (
                f"location = {route.rstrip('/')}" in nginx
                or f"location {route}" in nginx
                or f"location ^~ {route}" in nginx
            ), f"{name} route {route} is not visible in nginx"


def test_runtime_stack_status_tracks_completed_and_incomplete_migration_items() -> None:
    status = load_yaml(STATUS_FILE)
    stacks = status["stacks"]

    assert stacks["postgresPrimaryStore"]["status"] == "active"
    assert stacks["telemetryBulkPersistence"]["status"] == "synthetic-benchmarked"
    assert stacks["grpcInternalStreaming"]["status"] == "active"
    assert stacks["dragonflyCacheProfile"]["status"] == "profile"
    assert stacks["mqttTelemetryBridge"]["status"] == "active"
    assert stacks["webCodecsCanvasPipeline"]["status"] == "prototype"
    assert stacks["http3EdgeProfile"]["status"] == "deferred"
    assert stacks["aiOverlaySidecar"]["status"] == "contract"


def test_non_active_items_record_missing_runtime_or_profile_gate() -> None:
    status = load_yaml(STATUS_FILE)

    for name, entry in status["stacks"].items():
        if entry["status"] == "active":
            continue
        has_missing_runtime = bool(entry.get("missingRuntime"))
        has_profile_runtime = bool(
            entry.get("runtime", {}).get("profile") or entry.get("runtime", {}).get("overrideFile")
        )
        has_contract_evidence = entry["status"] in {
            "runtime-validated-profile",
            "synthetic-benchmarked",
            "contract",
            "prototype",
            "deferred",
        } and bool(entry.get("evidence"))

        assert has_missing_runtime or has_profile_runtime or has_contract_evidence, (
            f"{name} must explain why it is not active yet"
        )


def test_evidence_paths_exist_for_runtime_stack_status() -> None:
    status = load_yaml(STATUS_FILE)

    for name, entry in status["stacks"].items():
        for evidence in entry["evidence"]:
            path = REPO_ROOT / evidence
            assert path.exists(), f"{name} evidence path does not exist: {evidence}"
