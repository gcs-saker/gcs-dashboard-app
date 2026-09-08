import runpy
from copy import deepcopy
from pathlib import Path
from typing import Any, Callable, cast

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPT = REPO_ROOT / "scripts/gates/attack_surface_gate.py"
MODULE = runpy.run_path(str(SCRIPT))
AttackSurfaceError = cast(type[BaseException], MODULE["AttackSurfaceError"])
load_yaml = cast(Callable[[Path], dict[str, Any]], MODULE["load_yaml"])
validate_attack_surface = cast(Callable[..., int], MODULE["validate_attack_surface"])
INVENTORY = REPO_ROOT / "docs/compliance/security/attack-surface.yml"
THREAT_MODEL = REPO_ROOT / "docs/compliance/security/threat-model.yml"


def documents() -> tuple[dict[str, Any], dict[str, Any]]:
    return load_yaml(INVENTORY), load_yaml(THREAT_MODEL)


def test_attack_surface_gate_accepts_complete_product_boundary() -> None:
    inventory, threat_model = documents()

    assert validate_attack_surface(inventory, threat_model) == 13


def test_attack_surface_gate_rejects_missing_surface() -> None:
    inventory, threat_model = documents()
    broken = deepcopy(inventory)
    broken["surfaces"] = broken["surfaces"][:-1]

    with pytest.raises(AttackSurfaceError, match="required product boundary"):
        validate_attack_surface(broken, threat_model)


def test_attack_surface_gate_rejects_unknown_threat_boundary() -> None:
    inventory, threat_model = documents()
    broken = deepcopy(threat_model)
    broken["threats"][0]["boundaries"] = ["TB-MISSING"]

    with pytest.raises(AttackSurfaceError, match="unknown trust boundaries"):
        validate_attack_surface(inventory, broken)


def test_attack_surface_gate_rejects_missing_evidence_path(tmp_path: Path) -> None:
    inventory, threat_model = documents()

    with pytest.raises(AttackSurfaceError, match="evidence path does not exist"):
        validate_attack_surface(inventory, threat_model, tmp_path)
