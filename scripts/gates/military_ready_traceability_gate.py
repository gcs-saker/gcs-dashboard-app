#!/usr/bin/env python3
from __future__ import annotations

import argparse
import re
from pathlib import Path
from typing import Any

import yaml

REPO_ROOT = Path(__file__).resolve().parents[2]
PROFILE_PATH = REPO_ROOT / "docs/compliance/software-military-ready-profile-v1.yml"
CATALOG_PATH = REPO_ROOT / "docs/compliance/requirements/software-military-ready-requirements.yml"
TRACE_PATH = REPO_ROOT / "docs/compliance/traceability/software-military-ready-traceability.yml"
FULL_COMMIT = re.compile(r"^[0-9a-f]{40}$")
ACTIVE_ASSURANCE_CLASSES = {"security", "safety"}


class TraceabilityError(AssertionError):
    pass


def load_yaml(path: Path) -> dict[str, Any]:
    document = yaml.safe_load(path.read_text(encoding="utf-8"))
    if not isinstance(document, dict):
        raise TraceabilityError(f"{path.relative_to(REPO_ROOT)} must contain a YAML object")
    return document


def validate_documents(
    profile: dict[str, Any], catalog: dict[str, Any], traceability: dict[str, Any], root: Path = REPO_ROOT
) -> int:
    requirements = indexed(catalog.get("requirements"), "requirements", "id")
    traces = indexed(traceability.get("traces"), "traces", "requirementId")
    profile_ids = profile_requirement_ids(profile)
    if set(requirements) != set(traces) or set(requirements) != profile_ids:
        raise TraceabilityError("profile, requirement catalog, and traceability IDs must match exactly")
    for requirement_id, requirement in requirements.items():
        validate_requirement(requirement_id, requirement, traces[requirement_id], root)
    validate_evidence_policy(traceability.get("evidencePolicy"))
    return len(requirements)


def indexed(value: Any, label: str, key: str) -> dict[str, dict[str, Any]]:
    if not isinstance(value, list) or not value:
        raise TraceabilityError(f"{label} must be a non-empty list")
    entries = {entry[key]: entry for entry in value if isinstance(entry, dict) and isinstance(entry.get(key), str)}
    if len(entries) != len(value):
        raise TraceabilityError(f"{label} must contain unique string {key} values")
    return entries


def profile_requirement_ids(profile: dict[str, Any]) -> set[str]:
    standards = profile.get("standards")
    if not isinstance(standards, list):
        raise TraceabilityError("profile standards must be a list")
    return {requirement_id for standard in standards for requirement_id in standard.get("requirementIds", [])}


def validate_requirement(requirement_id: str, requirement: dict[str, Any], trace: dict[str, Any], root: Path) -> None:
    if requirement.get("status") != trace.get("status"):
        raise TraceabilityError(f"{requirement_id}: catalog and trace status must match")
    require_local_refs(requirement_id, trace, root)
    if requirement.get("assuranceClass") in ACTIVE_ASSURANCE_CLASSES and not trace.get("threatsOrHazards"):
        raise TraceabilityError(f"{requirement_id}: security and safety requirements need a threat or hazard")
    status = requirement.get("status")
    if status == "PASS":
        validate_pass_trace(requirement_id, trace, root)
    elif status in {"NOT_RUN", "BLOCKED", "PLANNED_HARDWARE"} and not requirement.get("plannedWorkIssue"):
        raise TraceabilityError(f"{requirement_id}: incomplete work needs a tracking issue")


def require_local_refs(requirement_id: str, trace: dict[str, Any], root: Path) -> None:
    for field in ("designRefs", "codeRefs", "testRefs"):
        refs = trace.get(field, [])
        if not isinstance(refs, list):
            raise TraceabilityError(f"{requirement_id}: {field} must be a list")
        for reference in refs:
            if not isinstance(reference, str) or not (root / reference).exists():
                raise TraceabilityError(f"{requirement_id}: missing local reference {reference}")


def validate_pass_trace(requirement_id: str, trace: dict[str, Any], root: Path) -> None:
    for field in ("designRefs", "codeRefs", "testRefs", "evidenceRefs"):
        if not trace.get(field):
            raise TraceabilityError(f"{requirement_id}: PASS requires {field}")
    for reference in trace["evidenceRefs"]:
        manifest = load_yaml(root / reference)
        if not FULL_COMMIT.fullmatch(str(manifest.get("sourceCommit", ""))):
            raise TraceabilityError(f"{requirement_id}: evidence must bind a full source commit")


def validate_evidence_policy(policy: Any) -> None:
    if not isinstance(policy, dict) or policy.get("storage") != "manifest-plus-artifact":
        raise TraceabilityError("evidence storage must use manifest-plus-artifact")
    if "full source commit" not in str(policy.get("immutableBinding", "")):
        raise TraceabilityError("evidence policy must require an immutable full source commit")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    if not args.check:
        parser.error("--check is required")
    checked = validate_documents(load_yaml(PROFILE_PATH), load_yaml(CATALOG_PATH), load_yaml(TRACE_PATH))
    print(f"military-ready traceability contract passed for {checked} requirements")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
