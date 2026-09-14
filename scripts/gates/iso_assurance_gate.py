#!/usr/bin/env python3
from __future__ import annotations

import argparse
from pathlib import Path
from typing import Any

import yaml

REPO_ROOT = Path(__file__).resolve().parents[2]
ARCHITECTURE = REPO_ROOT / "docs/compliance/architecture/iso-42010-architecture-description.yml"
ARCHITECTURE_VIEWS = REPO_ROOT / "docs/compliance/architecture/system-architecture-views.yml"
QUALITY = REPO_ROOT / "docs/compliance/quality/software-quality-evaluation-profile.yml"
EVALUATION_PLAN = REPO_ROOT / "docs/compliance/quality/software-quality-evaluation-plan.yml"
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
REQUIRED_VIEW_IDS = {
    "AV-CONTEXT",
    "AV-FUNCTIONAL",
    "AV-DEPLOYMENT",
    "AV-INFORMATION",
    "AV-SECURITY",
    "AV-SAFETY",
    "AV-OPERATIONS",
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
    for field in (
        "systemOfInterest",
        "stakeholders",
        "viewpoints",
        "correspondenceRules",
        "decisionRecords",
    ):
        if not document.get(field):
            raise IsoAssuranceError(f"architecture description requires {field}")
    stakeholder_ids = {entry.get("id") for entry in document["stakeholders"]}
    if not {"operator", "security-assessor", "safety-reviewer"}.issubset(stakeholder_ids):
        raise IsoAssuranceError("architecture description omits required assurance stakeholders")
    if document.get("conformance", {}).get("claim") != "NOT_ASSESSED":
        raise IsoAssuranceError("architecture conformance must remain NOT_ASSESSED before independent review")
    if set(document.get("views", {}).get("requiredViewIds", [])) != REQUIRED_VIEW_IDS:
        raise IsoAssuranceError("architecture description must require all controlled views")


def validate_architecture_views(document: dict[str, Any]) -> None:
    if document.get("status") != "CONTROLLED_DRAFT_NOT_ASSESSED":
        raise IsoAssuranceError("architecture views must remain an unassessed controlled draft")
    components = _indexed_entries(document, "components")
    boundaries = _indexed_entries(document, "trustBoundaries")
    interfaces = _indexed_entries(document, "interfaces")
    states = _indexed_entries(document, "authoritativeState")
    view_ids = set(_indexed_entries(document, "views"))
    if view_ids != REQUIRED_VIEW_IDS:
        raise IsoAssuranceError("architecture view catalogue is incomplete")
    _validate_interfaces(interfaces, components)
    _validate_authoritative_states(states)
    _validate_operational_flows(document, interfaces, boundaries)


def _validate_interfaces(interfaces: dict[str, dict[str, Any]], components: dict[str, dict[str, Any]]) -> None:
    for interface in interfaces.values():
        if interface.get("owner") not in components and interface.get("owner") != "owning-application-service":
            raise IsoAssuranceError(f"interface has unknown owner: {interface['id']}")
        if not {"from", "to", "protocol", "contract", "exposure"}.issubset(interface):
            raise IsoAssuranceError(f"interface contract is incomplete: {interface['id']}")


def _validate_authoritative_states(states: dict[str, dict[str, Any]]) -> None:
    for state in states.values():
        required = {"owner", "store", "ttl", "invalidation", "degradedBehavior"}
        if not required.issubset(state):
            raise IsoAssuranceError(f"authoritative state contract is incomplete: {state['id']}")


def _validate_operational_flows(
    document: dict[str, Any],
    interfaces: dict[str, dict[str, Any]],
    boundaries: dict[str, dict[str, Any]],
) -> None:
    flows = document.get("operationalFlows")
    if not boundaries or not flows or not document.get("degradedBehavior"):
        raise IsoAssuranceError("architecture views require boundaries, flows, and degraded behavior")
    known_transports = set(interfaces)
    for flow in flows:
        alternatives = set(flow.get("transportAlternatives", []))
        if not alternatives.issubset(known_transports):
            raise IsoAssuranceError(f"operational flow has unknown transport: {flow.get('id')}")
        if not flow.get("sequence") or not flow.get("invariant"):
            raise IsoAssuranceError(f"operational flow is incomplete: {flow.get('id')}")


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
    required_fields = {
        "characteristic",
        "calculation",
        "unit",
        "proposedThreshold",
        "evidenceSource",
        "procedureRef",
    }
    for measure in measures:
        if not required_fields.issubset(measure) or measure["characteristic"] not in REQUIRED_CHARACTERISTICS:
            raise IsoAssuranceError(f"invalid quality measure: {measure.get('id')}")


def validate_evaluation_plan(document: dict[str, Any], quality: dict[str, Any]) -> None:
    if document.get("status") != "CONTROLLED_DRAFT_NOT_EXECUTED":
        raise IsoAssuranceError("evaluation plan must remain a non-executed controlled draft")
    if document.get("claim", {}).get("current") != "NOT_ASSESSED":
        raise IsoAssuranceError("quality claim must remain NOT_ASSESSED before independent conclusion")
    if document.get("roles", {}).get("acceptanceAuthority") != "pending-designation":
        raise IsoAssuranceError("acceptance authority cannot be self-approved in the draft plan")
    for field in (
        "scope",
        "independence",
        "entryCriteria",
        "exitCriteria",
        "environmentProfiles",
        "sampling",
    ):
        if not document.get(field):
            raise IsoAssuranceError(f"evaluation plan requires {field}")
    procedures = _indexed_entries(document, "procedures")
    measure_refs = {measure["procedureRef"] for measure in quality["measures"]}
    if set(procedures) != measure_refs:
        raise IsoAssuranceError("each quality measure must map to exactly one procedure")
    required = {"measureId", "environment", "method", "inputs", "outputs"}
    for procedure in procedures.values():
        if not required.issubset(procedure):
            raise IsoAssuranceError(f"quality procedure is incomplete: {procedure['id']}")
    if set(document.get("verdictRules", {})) != {"PASS", "FAIL", "BLOCKED", "NOT_RUN"}:
        raise IsoAssuranceError("evaluation plan verdict rules are incomplete")


def _indexed_entries(document: dict[str, Any], field: str) -> dict[str, dict[str, Any]]:
    entries = document.get(field)
    if not isinstance(entries, list) or not entries:
        raise IsoAssuranceError(f"{field} must be a non-empty list")
    indexed = {entry.get("id"): entry for entry in entries if isinstance(entry, dict)}
    if len(indexed) != len(entries) or None in indexed:
        raise IsoAssuranceError(f"{field} IDs must be present and unique")
    return indexed


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    if not args.check:
        parser.error("--check is required")
    architecture = load_yaml(ARCHITECTURE)
    quality = load_yaml(QUALITY)
    validate_architecture(architecture)
    validate_architecture_views(load_yaml(ARCHITECTURE_VIEWS))
    validate_quality(quality)
    validate_evaluation_plan(load_yaml(EVALUATION_PLAN), quality)
    print("ISO architecture and software quality assurance contract passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
