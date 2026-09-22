#!/usr/bin/env python3
from __future__ import annotations

from datetime import date
from pathlib import Path
from typing import Any

import yaml

ROOT = Path(__file__).resolve().parents[2]
MATRIX = ROOT / "docs/compliance/security/rmf-control-matrix.yml"
POAM = ROOT / "docs/compliance/security/poam.yml"
CONTROL_STATUSES = {"OPEN", "IMPLEMENTED_NOT_ASSESSED", "IMPLEMENTED_NOT_DEPLOYED", "ASSESSED_INTERNAL_PASS"}
POAM_STATUSES = {"OPEN", "CLOSED"}


class RmfEvidenceError(RuntimeError):
    pass


def load_yaml(path: Path) -> dict[str, Any]:
    document = yaml.safe_load(path.read_text(encoding="utf-8"))
    if not isinstance(document, dict):
        raise RmfEvidenceError(f"{path.name} must contain an object")
    return document


def validate_evidence(paths: list[Any], owner: str) -> None:
    if not paths:
        raise RmfEvidenceError(f"{owner} requires evidence")
    for path in paths:
        if not (ROOT / str(path)).exists():
            raise RmfEvidenceError(f"{owner} evidence is missing: {path}")


def validate_controls(controls: list[dict[str, Any]]) -> set[str]:
    identifiers: set[str] = set()
    for control in controls:
        identifier = str(control.get("id", ""))
        if not identifier or identifier in identifiers:
            raise RmfEvidenceError("RMF control IDs must be present and unique")
        if control.get("status") not in CONTROL_STATUSES:
            raise RmfEvidenceError(f"invalid RMF status: {identifier}")
        if not control.get("implementation") or not control.get("assessment"):
            raise RmfEvidenceError(f"RMF traceability is incomplete: {identifier}")
        validate_evidence(control.get("evidence", []), identifier)
        identifiers.add(identifier)
    return identifiers


def validate_poam(items: list[dict[str, Any]], control_ids: set[str], today: date) -> None:
    identifiers: set[str] = set()
    for item in items:
        identifier = str(item.get("id", ""))
        if not identifier or identifier in identifiers:
            raise RmfEvidenceError("POA&M IDs must be present and unique")
        if item.get("status") not in POAM_STATUSES or not item.get("issue") or not item.get("mitigation"):
            raise RmfEvidenceError(f"POA&M ownership is incomplete: {identifier}")
        if not set(item.get("controls", [])) <= control_ids:
            raise RmfEvidenceError(f"POA&M references an unknown control: {identifier}")
        due_by = date.fromisoformat(str(item.get("dueBy")))
        if item["status"] == "OPEN" and due_by < today:
            raise RmfEvidenceError(f"POA&M item is overdue: {identifier}")
        if item["status"] == "CLOSED":
            date.fromisoformat(str(item.get("closedAt")))
            validate_evidence(item.get("evidence", []), identifier)
        identifiers.add(identifier)


def validate(today: date = date.today()) -> None:
    matrix = load_yaml(MATRIX)
    poam = load_yaml(POAM)
    control_ids = validate_controls(matrix.get("controls", []))
    validate_poam(poam.get("items", []), control_ids, today)


def main() -> int:
    validate()
    print("RMF and POA&M evidence consistency passed")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (RmfEvidenceError, ValueError) as error:
        print(f"RMF evidence gate failed: {error}", file=__import__("sys").stderr)
        raise SystemExit(1)
