import importlib.util
from pathlib import Path

SCRIPT = Path(__file__).parents[2] / "scripts" / "ops" / "release_drift_report.py"
SPEC = importlib.util.spec_from_file_location("release_drift_report", SCRIPT)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


def manifest(commit: str = "abc", environment: str = "env") -> dict[str, object]:
    return {
        "schemaVersion": 1,
        "commit": commit,
        "composeSha256": "compose",
        "sourceComposeSha256": "source",
        "environmentSha256": environment,
        "mqttPasswordFileSha256": "mqtt",
        "flywayMigrations": [{"path": "V1.sql", "sha256": "migration"}],
    }


def test_equal_manifests_are_in_sync() -> None:
    assert MODULE.compare(manifest(), manifest()) == []


def test_reports_commit_and_secret_configuration_hash_drift() -> None:
    differences = MODULE.compare(manifest(), manifest(commit="def", environment="other"))
    assert {item["field"] for item in differences} == {"commit", "environmentSha256"}
