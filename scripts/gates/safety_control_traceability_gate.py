#!/usr/bin/env python3
from __future__ import annotations

import argparse
from pathlib import Path
from typing import Any

import yaml

REPO_ROOT = Path(__file__).resolve().parents[2]
CATALOGUE_PATH = REPO_ROOT / "docs/compliance/safety/safety-control-catalogue.yml"
HAZARD_PATH = REPO_ROOT / "docs/compliance/safety/hazard-log.yml"
TRACE_PATH = REPO_ROOT / "docs/compliance/traceability/software-military-ready-traceability.yml"
VALID_OWNERS = {"auth-policy", "media-control", "dashboard"}


class SafetyControlTraceabilityError(AssertionError):
    pass


def load_yaml(path: Path) -> dict[str, Any]:
    document = yaml.safe_load(path.read_text(encoding="utf-8"))
    if not isinstance(document, dict):
        raise SafetyControlTraceabilityError(f"{path.name} must contain an object")
    return document


def unique(entries: Any, key: str, label: str) -> dict[str, dict[str, Any]]:
    if not isinstance(entries, list):
        raise SafetyControlTraceabilityError(f"{label} must be a list")
    indexed = {
        entry.get(key): entry for entry in entries if isinstance(entry, dict) and isinstance(entry.get(key), str)
    }
    if len(indexed) != len(entries):
        raise SafetyControlTraceabilityError(f"{label} IDs must be unique strings")
    return indexed


def referenced_hazards(traceability: dict[str, Any]) -> set[str]:
    return {
        hazard_id
        for trace in traceability.get("traces", [])
        for hazard_id in trace.get("threatsOrHazards", [])
        if isinstance(hazard_id, str) and hazard_id.startswith("HAZ-")
    }


def validate_requirement(requirement: dict[str, Any], allowed_statuses: set[str]) -> None:
    requirement_id = requirement["id"]
    status = requirement.get("status")
    if (
        status not in allowed_statuses
        or requirement.get("owner") not in VALID_OWNERS
        or not requirement.get("statement")
    ):
        raise SafetyControlTraceabilityError(f"{requirement_id}: invalid status owner or statement")
    code_refs = requirement.get("codeRefs")
    test_refs = requirement.get("testRefs")
    if not isinstance(code_refs, list) or not isinstance(test_refs, list):
        raise SafetyControlTraceabilityError(f"{requirement_id}: code and test refs must be lists")
    for reference in [*code_refs, *test_refs]:
        if not (REPO_ROOT / reference).is_file():
            raise SafetyControlTraceabilityError(f"{requirement_id}: missing reference {reference}")
    if status == "IMPLEMENTED" and (not code_refs or not test_refs or requirement.get("gap")):
        raise SafetyControlTraceabilityError(
            f"{requirement_id}: implemented control requires code and tests without a gap"
        )
    if status in {"PARTIAL", "PLANNED"} and (not requirement.get("gap") or not requirement.get("followUpIssue")):
        raise SafetyControlTraceabilityError(f"{requirement_id}: incomplete control requires a gap and follow-up issue")


def validate_catalogue(
    catalogue: dict[str, Any], hazard_log: dict[str, Any], traceability: dict[str, Any]
) -> dict[str, int]:
    if catalogue.get("status") != "CONTROLLED_PARTIAL_IMPLEMENTATION":
        raise SafetyControlTraceabilityError("safety control catalogue must remain a controlled partial baseline")
    hazards = unique(hazard_log.get("hazards"), "id", "hazards")
    scope = catalogue.get("scopeHazards")
    if (
        not isinstance(scope, list)
        or len(scope) != 5
        or len(set(scope)) != len(scope)
        or not set(scope).issubset(hazards)
    ):
        raise SafetyControlTraceabilityError("exactly five known focus hazards are required")
    requirements = unique(catalogue.get("requirements"), "id", "safety requirements")
    expected = {item for hazard_id in scope for item in hazards[hazard_id]["safetyRequirements"]}
    if set(requirements) != expected:
        raise SafetyControlTraceabilityError("catalogue must cover every focus-hazard safety requirement exactly once")
    if any(requirement.get("hazardId") not in scope for requirement in requirements.values()):
        raise SafetyControlTraceabilityError("safety requirement references an out-of-scope hazard")
    if any(
        requirement_id not in hazards[item["hazardId"]]["safetyRequirements"]
        for requirement_id, item in requirements.items()
    ):
        raise SafetyControlTraceabilityError("safety requirement is assigned to the wrong hazard")
    if not set(scope).issubset(referenced_hazards(traceability)):
        raise SafetyControlTraceabilityError("every focus hazard requires a top-level requirement trace")
    allowed_statuses = set(catalogue.get("allowedStatuses", []))
    if allowed_statuses != {"IMPLEMENTED", "PARTIAL", "PLANNED"}:
        raise SafetyControlTraceabilityError("safety control statuses are fixed")
    for requirement in requirements.values():
        validate_requirement(requirement, allowed_statuses)
    counts = {status: sum(item["status"] == status for item in requirements.values()) for status in allowed_statuses}
    return {"hazards": len(scope), "requirements": len(requirements), **counts}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    if not args.check:
        parser.error("--check is required")
    counts = validate_catalogue(load_yaml(CATALOGUE_PATH), load_yaml(HAZARD_PATH), load_yaml(TRACE_PATH))
    print(f"safety control traceability passed: {counts}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
