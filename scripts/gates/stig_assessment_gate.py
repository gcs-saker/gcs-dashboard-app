#!/usr/bin/env python3
from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "docs/compliance/security/asd-stig-v6r4-checklist.json"
ASSESSMENT = ROOT / "docs/compliance/security/asd-stig-v6r4-assessment.yml"
VERDICTS = {"NOT_A_FINDING", "OPEN", "NOT_APPLICABLE"}


class StigAssessmentError(RuntimeError):
    pass


@dataclass
class AssessmentContext:
    source: dict[str, Any]
    assessed: set[str]
    cci_blocked: bool


def load_assessment() -> dict[str, Any]:
    value = yaml.safe_load(ASSESSMENT.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise StigAssessmentError("STIG assessment must be an object")
    return value


def validate() -> dict[str, int]:
    source = json.loads(SOURCE.read_text(encoding="utf-8"))
    source_rules = {rule["findingId"]: rule for rule in source["rules"]}
    assessment = load_assessment()
    assessed: set[str] = set()
    context = AssessmentContext(
        source_rules,
        assessed,
        str(assessment.get("cciSourceStatus", "")).startswith("BLOCKED_"),
    )
    counts = {verdict: 0 for verdict in sorted(VERDICTS)}
    for rule in assessment.get("rules", []):
        validate_rule(rule, context)
        counts[str(rule["status"])] += 1
        assessed.add(str(rule["findingId"]))
    remaining = len(source_rules) - len(assessed)
    if assessment.get("unassessedDefault") != "OPEN" or not assessment.get("unassessedRationale"):
        raise StigAssessmentError("unassessed STIG rules must fail closed as Open")
    counts["OPEN"] += remaining
    return counts


def validate_rule(rule: dict[str, Any], context: AssessmentContext) -> None:
    finding_id = str(rule.get("findingId", ""))
    if finding_id in context.assessed or finding_id not in context.source:
        raise StigAssessmentError("assessment finding ID is missing, unknown, or duplicated")
    if rule.get("stigId") != context.source[finding_id].get("stigId") or rule.get("status") not in VERDICTS:
        raise StigAssessmentError(f"invalid STIG identity or verdict: {finding_id}")
    if not rule.get("nistControls") or not rule.get("rationale") or not rule.get("evidence"):
        raise StigAssessmentError(f"assessment traceability is incomplete: {finding_id}")
    for evidence in rule["evidence"]:
        if not (ROOT / str(evidence)).exists():
            raise StigAssessmentError(f"assessment evidence is missing: {evidence}")
    if not rule.get("cciRefs") and not context.cci_blocked:
        raise StigAssessmentError(f"CCI mapping is absent without a blocker: {finding_id}")


if __name__ == "__main__":
    try:
        print(json.dumps(validate(), sort_keys=True))
    except StigAssessmentError as error:
        print(f"STIG assessment gate failed: {error}", file=__import__("sys").stderr)
        raise SystemExit(1)
