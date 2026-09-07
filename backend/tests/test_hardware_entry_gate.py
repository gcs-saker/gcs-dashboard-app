from pathlib import Path

import yaml

REPO_ROOT = Path(__file__).resolve().parents[2]
GATE = REPO_ROOT / "docs/compliance/hardware/prototype-entry-gate.yml"


def test_hardware_gate_keeps_unavailable_qualification_planned() -> None:
    gate = yaml.safe_load(GATE.read_text(encoding="utf-8"))
    requirements = gate["requirements"]

    assert gate["currentPhase"] == "SOFTWARE_ONLY"
    assert gate["allowedCurrentStatus"] == "PLANNED_HARDWARE"
    assert {item["id"] for item in requirements} == {"MR-HW-ENV-001", "MR-HW-EMC-001"}
    assert all(item["status"] == "PLANNED_HARDWARE" for item in requirements)
    assert all(item["prerequisites"] for item in requirements)


def test_hardware_gate_requires_tailoring_and_retest_budget() -> None:
    gate = yaml.safe_load(GATE.read_text(encoding="utf-8"))
    template = gate["testPlanningTemplate"]

    assert "tailoredMethods" in template["requiredFields"]
    assert "sourceCommit" in template["requiredFields"]
    assert "retestReserve" in template["costScheduleFields"]
    assert "BLOCKED" in template["verdicts"]

