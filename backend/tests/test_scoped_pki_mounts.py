from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[2]
COMPOSE = ROOT / "deploy/compose/compose.single-node.poc.yml"
POLICY = ROOT / "docs/compliance/security/server01-secret-exposure-matrix.yml"
PKI_ROOT = "/run/secrets/gcs-pki"

EXPECTED_FILES = {
    "postgres-geo": {"postgres.crt", "postgres.key"},
    "redis": {"ca.crt", "redis.crt", "redis.key"},
    "mqtt": {"ca.crt", "ca.crl", "mqtt.crt", "mqtt.key", "mqtt-health.crt", "mqtt-health.key"},
    "backend": {"ca.crt", "backend.crt", "backend.key"},
    "auth-policy": {"ca.crt", "auth-policy.crt", "auth-policy.key"},
    "media-control": {"ca.crt", "media-control.crt", "media-control.key"},
    "turn-primary": {"turn-primary.crt", "turn-primary.key"},
    "turn-secondary": {"turn-secondary.crt", "turn-secondary.key"},
}


def test_services_receive_only_their_owned_pki_files() -> None:
    services = yaml.safe_load(COMPOSE.read_text(encoding="utf-8"))["services"]
    policy = yaml.safe_load(POLICY.read_text(encoding="utf-8"))

    for service_name, expected_files in EXPECTED_FILES.items():
        assert set(policy["services"][service_name]) == expected_files
        mounts = [item for item in services[service_name]["volumes"] if isinstance(item, dict)]
        pki_mounts = [item for item in mounts if item["target"].startswith(f"{PKI_ROOT}/")]
        assert {Path(item["target"]).name for item in pki_mounts} == expected_files
        assert all(item["read_only"] is True for item in pki_mounts)
        assert all(Path(item["source"]).name == Path(item["target"]).name for item in pki_mounts)


def test_no_production_service_mounts_the_whole_pki_directory() -> None:
    services = yaml.safe_load(COMPOSE.read_text(encoding="utf-8"))["services"]
    policy = yaml.safe_load(POLICY.read_text(encoding="utf-8"))

    assert policy["wholeDirectoryMountAllowed"] is False
    for service in services.values():
        mounts = [item for item in service.get("volumes", []) if isinstance(item, dict)]
        assert all(item["target"] != PKI_ROOT for item in mounts)
