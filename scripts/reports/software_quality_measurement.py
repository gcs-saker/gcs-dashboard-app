#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import yaml

REPO_ROOT = Path(__file__).resolve().parents[2]
REQUIREMENTS_PATH = REPO_ROOT / "docs/compliance/requirements/software-product-test-requirements.yml"
AUTHORIZATION_PATH = REPO_ROOT / "docs/compliance/security/authorization-denial-matrix.yml"
QUALITY_PATH = REPO_ROOT / "docs/compliance/quality/software-quality-evaluation-profile.yml"
OPERATIONAL_PROFILE_PATH = REPO_ROOT / "docs/compliance/quality/server01-software-operational-profile.yml"
ALLOWED_STATUSES = {"PASS", "FAIL", "SKIPPED"}


class QualityMeasurementError(ValueError):
    pass


def load_yaml(path: Path) -> dict[str, Any]:
    document = yaml.safe_load(path.read_text(encoding="utf-8"))
    if not isinstance(document, dict):
        raise QualityMeasurementError(f"{path.name} must contain an object")
    return document


def validate_catalogues() -> None:
    requirements = load_yaml(REQUIREMENTS_PATH)
    authorization = load_yaml(AUTHORIZATION_PATH)
    quality = load_yaml(QUALITY_PATH)
    operational_profile = load_yaml(OPERATIONAL_PROFILE_PATH)
    _validate_requirements(requirements)
    _validate_authorization(authorization)
    _validate_operational_profile(operational_profile)
    _validate_thresholds(quality)


def _validate_operational_profile(document: dict[str, Any]) -> None:
    if document.get("status") != "CONTROLLED_DRAFT_NOT_APPROVED":
        raise QualityMeasurementError("operational profile must remain an unapproved draft")
    workload_ids = set(_indexed(document, "workloads"))
    required_workloads = {
        "WL-CONTROL-NOMINAL",
        "WL-CONTROL-PEAK",
        "WL-STREAM-NOMINAL",
        "WL-STREAM-ACCEPTANCE",
        "WL-TELEMETRY-PEAK",
    }
    if workload_ids != required_workloads:
        raise QualityMeasurementError("operational workload profile is incomplete")
    if set(_indexed(document, "networkConditions")) != {"NET-NOMINAL", "NET-DEGRADED", "NET-INTERRUPTED"}:
        raise QualityMeasurementError("operational network profile is incomplete")
    if not document.get("executionCapture", {}).get("required"):
        raise QualityMeasurementError("operational profile requires execution capture fields")


def _validate_thresholds(quality: dict[str, Any]) -> None:
    if quality.get("thresholdPolicy", {}).get("status") != "PROPOSED_NOT_APPROVED":
        raise QualityMeasurementError("quality thresholds must remain proposed")
    thresholds = quality.get("proposedAcceptanceThresholds", {})
    required = {
        "functionalCompletenessRatio",
        "authorizationCorrectDenialRatio",
        "authorizationUnexpectedPermitCount",
        "unrecoverableAcceptedRecordCount",
        "recoveryRatio",
        "controlPlaneLatencyP95Milliseconds",
        "telemetryAcceptanceLatencyP95Milliseconds",
        "recoveryTimeObjectiveSeconds",
        "continuousOperationHours",
    }
    if not required.issubset(thresholds):
        raise QualityMeasurementError("proposed acceptance thresholds are incomplete")


def _validate_requirements(document: dict[str, Any]) -> None:
    entries = _indexed(document, "requirements")
    required = {"parentIds", "characteristic", "statement", "verification", "testRefs", "selectors"}
    for entry in entries.values():
        if not required.issubset(entry) or not entry["selectors"]:
            raise QualityMeasurementError(f"incomplete product requirement: {entry['id']}")
        for reference in entry["testRefs"]:
            if not (REPO_ROOT / reference).exists():
                raise QualityMeasurementError(f"missing test reference: {entry['id']} -> {reference}")
    selectors = [selector for entry in entries.values() for selector in entry["selectors"]]
    if len(selectors) != len(set(selectors)):
        raise QualityMeasurementError("product requirement selectors must be unique")


def _validate_authorization(document: dict[str, Any]) -> None:
    cases = _indexed(document, "cases")
    categories = set(document.get("categories", []))
    actual_categories = {case.get("category") for case in cases.values()}
    if categories != actual_categories:
        raise QualityMeasurementError("authorization denial categories are incomplete")
    if any(case.get("expected") != "DENY" or not case.get("selector") for case in cases.values()):
        raise QualityMeasurementError("authorization cases must define DENY selectors")
    selectors = [case["selector"] for case in cases.values()]
    if len(selectors) != len(set(selectors)):
        raise QualityMeasurementError("authorization selectors must be unique")
    sources = document.get("selectorSources", {})
    for selector in selectors:
        class_name, test_name = selector.split("::", 1)
        source = REPO_ROOT / sources.get(class_name, "missing")
        if not source.is_file() or test_name not in source.read_text(encoding="utf-8"):
            raise QualityMeasurementError(f"authorization selector has no source test: {selector}")


def _indexed(document: dict[str, Any], field: str) -> dict[str, dict[str, Any]]:
    entries = document.get(field)
    if not isinstance(entries, list) or not entries:
        raise QualityMeasurementError(f"{field} must be a non-empty list")
    indexed = {entry.get("id"): entry for entry in entries if isinstance(entry, dict)}
    if len(indexed) != len(entries) or None in indexed:
        raise QualityMeasurementError(f"{field} IDs must be present and unique")
    return indexed


def collect_junit(paths: list[Path]) -> tuple[dict[str, str], list[dict[str, str]]]:
    results: dict[str, str] = {}
    artifacts: list[dict[str, str]] = []
    for path in paths:
        root = ET.parse(path).getroot()
        for case in root.iter("testcase"):
            selector = _selector(case)
            status = _test_status(case)
            _merge_result(results, selector, status)
        artifacts.append(_artifact(path))
    return results, artifacts


def collect_verification(
    paths: list[Path], expected_commit: str | None = None
) -> tuple[dict[str, str], list[dict[str, str]]]:
    results: dict[str, str] = {}
    artifacts: list[dict[str, str]] = []
    required_commit = expected_commit or _source_commit()
    for path in paths:
        document = json.loads(path.read_text(encoding="utf-8"))
        if document.get("schemaVersion") != "gcs-saker.verification-results.v1":
            raise QualityMeasurementError(f"unsupported verification evidence: {path}")
        if document.get("sourceCommit") != required_commit:
            raise QualityMeasurementError(f"verification evidence commit mismatch: {path}")
        for entry in document.get("results", []):
            _merge_result(results, entry.get("selector"), entry.get("result"))
        artifacts.append(_artifact(path, "application/json"))
    return results, artifacts


def _selector(case: ET.Element) -> str:
    class_name = case.attrib.get("classname", "").rsplit(".", 1)[-1]
    test_name = case.attrib.get("name", "").removesuffix("()")
    if not class_name or not test_name:
        raise QualityMeasurementError("JUnit testcase requires classname and name")
    return f"{class_name}::{test_name}"


def _test_status(case: ET.Element) -> str:
    if case.find("failure") is not None or case.find("error") is not None:
        return "FAIL"
    if case.find("skipped") is not None:
        return "SKIPPED"
    return "PASS"


def _merge_result(results: dict[str, str], selector: Any, status: Any) -> None:
    if not isinstance(selector, str) or status not in ALLOWED_STATUSES | {"BLOCKED"}:
        raise QualityMeasurementError("verification result requires a selector and controlled status")
    precedence = {"PASS": 0, "SKIPPED": 1, "BLOCKED": 2, "FAIL": 3}
    previous = results.get(selector)
    results[selector] = status if previous is None or precedence[status] > precedence[previous] else previous


def _artifact(path: Path, media_type: str = "application/junit+xml") -> dict[str, str]:
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    return {"path": str(path), "sha256": digest, "mediaType": media_type}


def measure_functional(results: dict[str, str]) -> dict[str, Any]:
    requirements = _indexed(load_yaml(REQUIREMENTS_PATH), "requirements")
    rows = [_functional_row(entry, results) for entry in requirements.values()]
    verified = sum(row["result"] == "PASS" for row in rows)
    failures = [row["id"] for row in rows if row["result"] == "FAIL"]
    ratio = verified / len(rows)
    return {
        "measureId": "QM-FUNC-COMPLETE",
        "applicableCount": len(rows),
        "verifiedCount": verified,
        "ratio": ratio,
        "failedIds": failures,
        "unverifiedIds": [row["id"] for row in rows if row["result"] != "PASS"],
        "cases": rows,
        "verdict": _draft_verdict(rows),
    }


def _functional_row(entry: dict[str, Any], results: dict[str, str]) -> dict[str, Any]:
    statuses = [results.get(selector, "NOT_RUN") for selector in entry["selectors"]]
    if "FAIL" in statuses:
        result = "FAIL"
    elif entry.get("status") == "BLOCKED":
        result = "BLOCKED"
    elif statuses and all(status == "PASS" for status in statuses):
        result = "PASS"
    else:
        result = "NOT_RUN"
    return {"id": entry["id"], "result": result, "selectors": entry["selectors"]}


def measure_authorization(results: dict[str, str]) -> dict[str, Any]:
    cases = _indexed(load_yaml(AUTHORIZATION_PATH), "cases")
    rows = [{"id": case["id"], "result": results.get(case["selector"], "NOT_RUN")} for case in cases.values()]
    attempted = sum(row["result"] in ALLOWED_STATUSES for row in rows)
    denied = sum(row["result"] == "PASS" for row in rows)
    failures = [row["id"] for row in rows if row["result"] == "FAIL"]
    return {
        "measureId": "QM-AUTHZ-DENIAL",
        "totalCases": len(rows),
        "attemptedCount": attempted,
        "correctlyDeniedCount": denied,
        "correctlyDeniedRatio": denied / attempted if attempted else 0.0,
        "unexpectedPermitOrFailureIds": failures,
        "unexecutedIds": [row["id"] for row in rows if row["result"] != "PASS"],
        "cases": rows,
        "verdict": _draft_verdict(rows),
    }


def _draft_verdict(rows: list[dict[str, Any]]) -> str:
    results = {row["result"] for row in rows}
    if "FAIL" in results:
        return "FAIL"
    if results == {"PASS"}:
        return "BLOCKED"
    if "BLOCKED" in results:
        return "BLOCKED"
    return "NOT_RUN"


def build_report(mode: str, junit_paths: list[Path], evidence_paths: list[Path]) -> dict[str, Any]:
    results, artifacts = collect_junit(junit_paths)
    verification_results, verification_artifacts = collect_verification(evidence_paths)
    for selector, status in verification_results.items():
        _merge_result(results, selector, status)
    artifacts.extend(verification_artifacts)
    measurement = measure_functional(results) if mode == "functional" else measure_authorization(results)
    return {
        "schemaVersion": "gcs-saker.quality-measurement-result.v1",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "sourceCommit": _source_commit(),
        "thresholdStatus": "PROPOSED_NOT_APPROVED",
        "artifacts": artifacts,
        **measurement,
    }


def _source_commit() -> str:
    return subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=REPO_ROOT, text=True).strip()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--mode", choices=("functional", "authorization"))
    parser.add_argument("--junit", action="append", default=[])
    parser.add_argument("--evidence", action="append", default=[])
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    validate_catalogues()
    if args.check:
        print("software quality measurement catalogues passed")
        return 0
    if not args.mode or not (args.junit or args.evidence) or not args.output:
        parser.error("--mode, evidence input, and --output are required for measurement")
    report = build_report(
        args.mode,
        [Path(value) for value in args.junit],
        [Path(value) for value in args.evidence],
    )
    args.output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    summary_fields = (
        ("measureId", "attemptedCount", "correctlyDeniedCount", "correctlyDeniedRatio", "verdict")
        if args.mode == "authorization"
        else ("measureId", "applicableCount", "verifiedCount", "ratio", "verdict")
    )
    print(json.dumps({field: report[field] for field in summary_fields}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
