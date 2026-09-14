#!/usr/bin/env python3
from __future__ import annotations

import argparse
from pathlib import Path
from typing import Any

import yaml

REPO_ROOT = Path(__file__).resolve().parents[2]
ARCHITECTURE = REPO_ROOT / "docs/compliance/architecture/iso-42010-architecture-description.yml"
QUALITY = REPO_ROOT / "docs/compliance/quality/software-quality-evaluation-profile.yml"
REQUIRED_CHARACTERISTICS = {
    "functional-suitability",
    "performance-efficiency",
    "compatibility",
    "interaction-capability",
    "reliability",
    "security",
    "maintainability",
    "flexibility",
    "safety",
}


class IsoAssuranceError(AssertionError):
    pass


def load_yaml(path: Path) -> dict[str, Any]:
    document = yaml.safe_load(path.read_text(encoding="utf-8"))
    if not isinstance(document, dict):
        raise IsoAssuranceError(f"{path.name} must contain a YAML object")
    return document


def validate_architecture(document: dict[str, Any]) -> None:
    if document.get("standard") != "ISO/IEC/IEEE 42010:2022":
        raise IsoAssuranceError("architecture standard revision must be ISO/IEC/IEEE 42010:2022")
    for field in ("systemOfInterest", "stakeholders", "viewpoints", "correspondenceRules", "decisionRecords"):
        if not document.get(field):
            raise IsoAssuranceError(f"architecture description requires {field}")
    stakeholder_ids = {entry.get("id") for entry in document["stakeholders"]}
    if not {"operator", "security-assessor", "safety-reviewer"}.issubset(stakeholder_ids):
        raise IsoAssuranceError("architecture description omits required assurance stakeholders")
    if document.get("conformance", {}).get("claim") != "NOT_ASSESSED":
        raise IsoAssuranceError("architecture conformance must remain NOT_ASSESSED before independent review")


def validate_quality(document: dict[str, Any]) -> None:
    standards = set(document.get("standards", []))
    required = {"ISO/IEC 25010:2023", "ISO/IEC 25023:2016", "ISO/IEC 25040:2024"}
    if standards != required:
        raise IsoAssuranceError("quality profile standard revisions are incomplete")
    if set(document.get("qualityCharacteristics", [])) != REQUIRED_CHARACTERISTICS:
        raise IsoAssuranceError("ISO/IEC 25010 product quality characteristics are incomplete")
    if document.get("thresholdPolicy", {}).get("status") != "PROPOSED_NOT_APPROVED":
        raise IsoAssuranceError("unapproved thresholds must remain proposed")
    validate_measures(document.get("measures"))
    process = document.get("evaluationProcess", {})
    if process.get("verdicts") != ["PASS", "FAIL", "BLOCKED", "NOT_RUN"]:
        raise IsoAssuranceError("evaluation verdict vocabulary is invalid")


def validate_measures(measures: Any) -> None:
    if not isinstance(measures, list) or not measures:
        raise IsoAssuranceError("quality measures must be a non-empty list")
    ids = {measure.get("id") for measure in measures if isinstance(measure, dict)}
    if len(ids) != len(measures) or None in ids:
        raise IsoAssuranceError("quality measure IDs must be unique")
    required_fields = {"characteristic", "calculation", "unit", "proposedThreshold", "evidenceSource"}
    for measure in measures:
        if not required_fields.issubset(measure) or measure["characteristic"] not in REQUIRED_CHARACTERISTICS:
            raise IsoAssuranceError(f"invalid quality measure: {measure.get('id')}")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    if not args.check:
        parser.error("--check is required")
    validate_architecture(load_yaml(ARCHITECTURE))
    validate_quality(load_yaml(QUALITY))
    print("ISO architecture and software quality assurance contract passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
