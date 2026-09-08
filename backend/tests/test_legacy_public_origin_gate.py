from pathlib import Path
import runpy


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
GATE = REPOSITORY_ROOT / "scripts" / "gates" / "legacy_public_origin_check.py"


def gate_namespace() -> dict:
    return runpy.run_path(str(GATE), run_name="legacy_public_origin_gate")


def test_active_configuration_has_no_retired_production_hostname() -> None:
    assert gate_namespace()["legacy_host_violations"]() == []


def test_gate_covers_browser_and_public_ice_defaults() -> None:
    active_paths = set(gate_namespace()["ACTIVE_PATHS"])
    assert "gcs-dashboard/vite.config.ts" in active_paths
    assert "deploy/compose/.env.public-ice.example" in active_paths
