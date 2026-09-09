import importlib.util
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts/smoke/auth_boundary_dast.py"


def load_module():
    spec = importlib.util.spec_from_file_location("auth_boundary_dast", SCRIPT)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def test_dast_scenarios_cover_owned_attack_boundaries() -> None:
    module = load_module()
    names = {scenario.name for scenario in module.scenarios()}

    assert names == {
        "admin_unauthenticated",
        "graphql_unauthenticated",
        "websocket_unauthenticated",
        "login_malformed_json",
        "login_oversized",
        "admin_path_traversal",
    }


def test_remote_dast_requires_explicit_https_approval() -> None:
    module = load_module()

    with pytest.raises(ValueError, match="explicit approval"):
        module.validate_target("https://example.test", allow_remote=False)
    with pytest.raises(ValueError, match="explicit approval"):
        module.validate_target("http://example.test", allow_remote=True)
    module.validate_target("https://example.test", allow_remote=True)
    module.validate_target("http://127.0.0.1:8080", allow_remote=False)
