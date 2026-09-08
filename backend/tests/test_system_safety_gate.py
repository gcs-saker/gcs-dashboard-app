import runpy
from copy import deepcopy
from pathlib import Path
from typing import Any, Callable, cast

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPT = REPO_ROOT / "scripts/gates/system_safety_gate.py"
MODULE = runpy.run_path(str(SCRIPT))
SystemSafetyError = cast(type[BaseException], MODULE["SystemSafetyError"])
load_yaml = cast(Callable[[Path], dict[str, Any]], MODULE["load_yaml"])
validate_safety = cast(Callable[..., int], MODULE["validate_safety"])
HAZARDS = REPO_ROOT / "docs/compliance/safety/hazard-log.yml"
LOR = REPO_ROOT / "docs/compliance/safety/software-level-of-rigor.yml"
RISKS = REPO_ROOT / "docs/compliance/safety/residual-risk-register.yml"


def documents() -> tuple[dict[str, Any], dict[str, Any], dict[str, Any]]:
    return load_yaml(HAZARDS), load_yaml(LOR), load_yaml(RISKS)


def test_system_safety_gate_accepts_preliminary_hazard_baseline() -> None:
    hazards, lor, risks = documents()

    assert validate_safety(hazards, lor, risks) == 10


def test_system_safety_gate_rejects_hazard_without_lor() -> None:
    hazards, lor, risks = documents()
    broken = deepcopy(lor)
    broken["assignments"] = broken["assignments"][:-1]

    with pytest.raises(SystemSafetyError, match="exactly one LOR assignment"):
        validate_safety(hazards, broken, risks)


def test_system_safety_gate_rejects_unaccepted_closed_hazard() -> None:
    hazards, lor, risks = documents()
    broken = deepcopy(hazards)
    broken["hazards"][0]["status"] = "CLOSED"

    with pytest.raises(SystemSafetyError, match="accepted residual risk"):
        validate_safety(broken, lor, risks)


def test_system_safety_gate_rejects_acceptance_on_open_hazard() -> None:
    hazards, lor, risks = documents()
    broken = deepcopy(hazards)
    broken["hazards"][0]["acceptedBy"] = "unapproved-person"

    with pytest.raises(SystemSafetyError, match="open hazard cannot carry risk acceptance"):
        validate_safety(broken, lor, risks)
