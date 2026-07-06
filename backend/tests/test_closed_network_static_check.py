from pathlib import Path
import importlib.util
import shutil
import subprocess
import sys

import pytest


REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPT = REPO_ROOT / "scripts" / "gates" / "closed_network_static_check.py"
DEPLOY_CLOSED_ENV = REPO_ROOT / "deploy" / "compose" / ".env.closed-network.example"
DEPLOY_MIXED_ENV = REPO_ROOT / "deploy" / "compose" / ".env.mixed-network.example"
COMPOSE_FILE = REPO_ROOT / "deploy" / "compose" / "compose.single-node.poc.yml"


def load_static_check_module():
    spec = importlib.util.spec_from_file_location("closed_network_static_check", SCRIPT)
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def test_closed_network_static_check_passes_without_network_access() -> None:
    result = subprocess.run(
        [sys.executable, str(SCRIPT)],
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    assert "Closed-network static check passed" in result.stdout


def test_closed_network_static_check_functions_find_no_contract_errors() -> None:
    module = load_static_check_module()

    errors = [
        *module.check_closed_network_env(),
        *module.check_network_profile_split(),
        *module.check_offline_map(),
        *module.check_dashboard_serves_built_artifacts(),
        *module.check_offline_artifact_runbook(),
    ]

    assert errors == []


def test_closed_network_deploy_env_uses_internal_runtime_dependencies() -> None:
    content = DEPLOY_CLOSED_ENV.read_text(encoding="utf-8")

    assert "SAKER_NETWORK_PROFILE=closed" in content
    assert "VITE_MAP_PROVIDER=offline" in content
    assert "VITE_STATIC_ASSET_DELIVERY_MODE=offline-bundle" in content
    assert "MEDIA_CONTROL_STUN_URL=stun:10.0.0.10:3478" in content
    assert "MEDIA_CONTROL_TURN_PRIMARY_URL=turn:10.0.0.10:3478?transport=udp" in content
    assert "TIME_SYNC_MODE=closed_network" in content
    assert "postgres-geo:5432" in content
    assert "stun:stun.l.google.com:19302" not in content
    assert "services.arcgisonline.com" not in content


def test_mixed_network_profile_is_explicitly_separate_from_closed_network() -> None:
    content = DEPLOY_MIXED_ENV.read_text(encoding="utf-8")

    assert "SAKER_NETWORK_PROFILE=mixed" in content
    assert "VITE_STATIC_ASSET_DELIVERY_MODE=internal-cdn" in content
    assert "MEDIA_CONTROL_STUN_URL=stun:10.0.0.10:3478" in content
    assert "TIME_SYNC_MODE=public" in content


def test_closed_network_compose_config_accepts_profile_env() -> None:
    if shutil.which("docker") is None:
        pytest.skip("docker CLI is not available in this test environment")
    result = subprocess.run(
        [
            "docker",
            "compose",
            "--env-file",
            str(DEPLOY_CLOSED_ENV),
            "-f",
            str(COMPOSE_FILE),
            "config",
            "--quiet",
        ],
        check=False,
        capture_output=True,
        text=True,
        cwd=REPO_ROOT,
    )

    assert result.returncode == 0, result.stderr
