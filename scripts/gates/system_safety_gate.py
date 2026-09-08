#!/usr/bin/env python3
from __future__ import annotations

import argparse
from pathlib import Path
from typing import Any

import yaml

REPO_ROOT = Path(__file__).resolve().parents[2]
HAZARDS = REPO_ROOT / "docs/compliance/safety/hazard-log.yml"
LOR = REPO_ROOT / "docs/compliance/safety/software-level-of-rigor.yml"
RISKS = REPO_ROOT / "docs/compliance/safety/residual-risk-register.yml"
VALID_SWCI = {f"SwCI-{value}" for value in range(1, 6)}


class SystemSafetyError(AssertionError):
    pass


def load_yaml(path: Path) -> dict[str, Any]:
    document = yaml.safe_load(path.read_text(encoding="utf-8"))
    if not isinstance(document, dict):
        raise SystemSafetyError(f"{path} must contain a YAML object")
    return document


def validate_safety(hazard_log: dict[str, Any], lor: dict[str, Any], risks: dict[str, Any]) -> int:
    hazards = unique(hazard_log.get("hazards"), "hazard", "id")
    assignments = unique(lor.get("assignments"), "LOR assignment", "hazardId")
    if set(hazards) != set(assignments):
        raise SystemSafetyError("every hazard must have exactly one LOR assignment")
    if set(lor.get("levels", {})) != VALID_SWCI:
        raise SystemSafetyError("LOR activities must define SwCI-1 through SwCI-5")
    for hazard_id, hazard in hazards.items():
        validate_hazard(hazard_id, hazard, assignments[hazard_id])
    validate_risk_policy(risks)
    return len(hazards)


def unique(value: Any, label: str, key: str) -> dict[str, dict[str, Any]]:
    if not isinstance(value, list):
        raise SystemSafetyError(f"{label} values must be a list")
    entries = {item[key]: item for item in value if isinstance(item, dict) and isinstance(item.get(key), str)}
    if len(entries) != len(value):
        raise SystemSafetyError(f"{label} IDs must be unique strings")
    return entries


def validate_hazard(hazard_id: str, hazard: dict[str, Any], assignment: dict[str, Any]) -> None:
    required = ("mishap", "causes", "severity", "probability", "initialRisk", "safetyRequirements", "verification")
    for field in required:
        if not hazard.get(field):
            raise SystemSafetyError(f"{hazard_id}: missing {field}")
    if hazard.get("swci") not in VALID_SWCI or assignment.get("swci") != hazard.get("swci"):
        raise SystemSafetyError(f"{hazard_id}: inconsistent SwCI assignment")
    if hazard.get("status") == "CLOSED":
        if hazard.get("residualRisk") == "UNASSESSED" or not hazard.get("acceptedBy"):
            raise SystemSafetyError(f"{hazard_id}: closed hazard requires accepted residual risk")
    elif hazard.get("acceptedBy") is not None:
        raise SystemSafetyError(f"{hazard_id}: open hazard cannot carry risk acceptance")


def validate_risk_policy(risks: dict[str, Any]) -> None:
    policy = risks.get("policy", {})
    if policy.get("unassessedIsAccepted") is not False:
        raise SystemSafetyError("unassessed risk must never be accepted")
    if "evidence manifest" not in policy.get("closeRequires", []):
        raise SystemSafetyError("hazard closure must require evidence")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    if not args.check:
        parser.error("--check is required")
    checked = validate_safety(load_yaml(HAZARDS), load_yaml(LOR), load_yaml(RISKS))
    print(f"system-safety contract passed for {checked} hazards")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
