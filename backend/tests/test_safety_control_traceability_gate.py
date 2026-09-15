import runpy
from copy import deepcopy
from pathlib import Path
from typing import Any, Callable, cast

import pytest

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts/gates/safety_control_traceability_gate.py"
MODULE = runpy.run_path(str(SCRIPT))
SafetyControlTraceabilityError = cast(type[BaseException], MODULE["SafetyControlTraceabilityError"])
load_yaml = cast(Callable[[Path], dict[str, Any]], MODULE["load_yaml"])
validate_catalogue = cast(Callable[..., dict[str, int]], MODULE["validate_catalogue"])
CATALOGUE = ROOT / "docs/compliance/safety/safety-control-catalogue.yml"
HAZARDS = ROOT / "docs/compliance/safety/hazard-log.yml"
TRACEABILITY = ROOT / "docs/compliance/traceability/software-military-ready-traceability.yml"


def documents() -> tuple[dict[str, Any], dict[str, Any], dict[str, Any]]:
    return load_yaml(CATALOGUE), load_yaml(HAZARDS), load_yaml(TRACEABILITY)


def test_catalogue_truthfully_classifies_five_hazards_and_fifteen_controls() -> None:
    counts = validate_catalogue(*documents())

    assert counts == {"hazards": 5, "requirements": 15, "IMPLEMENTED": 7, "PARTIAL": 6, "PLANNED": 2}


def test_catalogue_rejects_missing_safety_requirement() -> None:
    catalogue, hazards, traceability = documents()
    broken = deepcopy(catalogue)
    broken["requirements"] = broken["requirements"][:-1]

    with pytest.raises(SafetyControlTraceabilityError, match="every focus-hazard safety requirement"):
        validate_catalogue(broken, hazards, traceability)


def test_implemented_control_requires_existing_code_and_test() -> None:
    catalogue, hazards, traceability = documents()
    broken = deepcopy(catalogue)
    implemented = next(item for item in broken["requirements"] if item["status"] == "IMPLEMENTED")
    implemented["testRefs"] = []

    with pytest.raises(SafetyControlTraceabilityError, match="requires code and tests"):
        validate_catalogue(broken, hazards, traceability)


def test_partial_control_requires_explicit_gap_and_follow_up() -> None:
    catalogue, hazards, traceability = documents()
    broken = deepcopy(catalogue)
    partial = next(item for item in broken["requirements"] if item["status"] == "PARTIAL")
    partial.pop("gap")

    with pytest.raises(SafetyControlTraceabilityError, match="requires a gap"):
        validate_catalogue(broken, hazards, traceability)


def test_requirement_cannot_be_assigned_to_another_hazard() -> None:
    catalogue, hazards, traceability = documents()
    broken = deepcopy(catalogue)
    broken["requirements"][0]["hazardId"] = "HAZ-TIME-ORDER"

    with pytest.raises(SafetyControlTraceabilityError, match="wrong hazard"):
        validate_catalogue(broken, hazards, traceability)


def test_focus_hazard_must_have_top_level_trace() -> None:
    catalogue, hazards, traceability = documents()
    broken = deepcopy(traceability)
    for trace in broken["traces"]:
        trace["threatsOrHazards"] = [
            hazard for hazard in trace.get("threatsOrHazards", []) if hazard != "HAZ-MISSION-STALE-COMMAND"
        ]

    with pytest.raises(SafetyControlTraceabilityError, match="top-level requirement trace"):
        validate_catalogue(catalogue, hazards, broken)
