#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import subprocess
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any

import yaml

REPO_ROOT = Path(__file__).resolve().parents[2]
PROFILE_PATH = REPO_ROOT / "docs/compliance/safety/hazard-closure-qualification.yml"
OUTPUT_SCHEMA = "gcs-saker.hazard-closure-result.v1"


class HazardClosureError(RuntimeError):
    pass


def load_object(path: Path) -> dict[str, Any]:
    document = (
        json.loads(path.read_text(encoding="utf-8"))
        if path.suffix == ".json"
        else yaml.safe_load(path.read_text(encoding="utf-8"))
    )
    if not isinstance(document, dict):
        raise HazardClosureError(f"{path.name} must contain an object")
    return document


def unique(entries: Any, key: str, label: str) -> dict[str, dict[str, Any]]:
    if not isinstance(entries, list):
        raise HazardClosureError(f"{label} must be a list")
    indexed = {item.get(key): item for item in entries if isinstance(item, dict) and isinstance(item.get(key), str)}
    if len(indexed) != len(entries):
        raise HazardClosureError(f"{label} IDs must be unique strings")
    return indexed


def input_path(profile: dict[str, Any], name: str) -> Path:
    return REPO_ROOT / profile["inputs"][name]


def validate_profile(profile: dict[str, Any]) -> None:
    if profile.get("status") != "CONTROLLED_DRAFT_NOT_EXECUTED":
        raise HazardClosureError("hazard closure profile must remain an unexecuted draft")
    if profile.get("standard") != "MIL-STD-882E Change 1":
        raise HazardClosureError("hazard closure profile has an unsupported standard")
    if profile.get("thresholds", {}).get("status") != "PROPOSED_NOT_APPROVED":
        raise HazardClosureError("hazard closure thresholds must remain proposed")
    required_fields = profile.get("closureRequirements", {}).get("residualRiskRequiredFields")
    if not isinstance(required_fields, list) or len(required_fields) < 9:
        raise HazardClosureError("residual-risk closure fields are incomplete")


def current_commit() -> str:
    completed = subprocess.run(
        ["git", "rev-parse", "HEAD"],
        cwd=REPO_ROOT,
        check=True,
        capture_output=True,
        text=True,
        timeout=10,
    )
    return completed.stdout.strip()


def hazard_traces(traceability: dict[str, Any]) -> dict[str, list[str]]:
    result: dict[str, list[str]] = {}
    for trace in traceability.get("traces", []):
        requirement_id = trace.get("requirementId")
        for hazard_id in trace.get("threatsOrHazards", []):
            if isinstance(hazard_id, str) and hazard_id.startswith("HAZ-"):
                result.setdefault(hazard_id, []).append(requirement_id)
    return result


def load_manifests(paths: list[Path], source_commit: str) -> dict[str, dict[str, Any]]:
    manifests: dict[str, dict[str, Any]] = {}
    for path in paths:
        document = load_object(path)
        evidence_id = document.get("evidenceId")
        if document.get("schemaVersion") != "gcs-saker.evidence-manifest.v1" or not isinstance(evidence_id, str):
            raise HazardClosureError(f"invalid evidence manifest: {path.name}")
        if evidence_id in manifests:
            raise HazardClosureError(f"duplicate evidence ID: {evidence_id}")
        if document.get("sourceCommit") != source_commit:
            raise HazardClosureError(f"evidence source commit mismatch: {evidence_id}")
        validate_manifest_metadata(document, evidence_id)
        manifests[evidence_id] = document
    return manifests


def validate_manifest_metadata(document: dict[str, Any], evidence_id: str) -> None:
    required = (
        "generatedAt",
        "environment",
        "procedure",
        "expectedResult",
        "actualResult",
        "reviewer",
    )
    if any(not document.get(field) for field in required):
        raise HazardClosureError(f"evidence manifest metadata is incomplete: {evidence_id}")
    artifacts = document.get("artifacts")
    if not isinstance(artifacts, list) or not artifacts:
        raise HazardClosureError(f"evidence manifest has no retained artifacts: {evidence_id}")
    for artifact in artifacts:
        digest = artifact.get("sha256") if isinstance(artifact, dict) else None
        if not isinstance(digest, str) or len(digest) != 64 or not artifact.get("immutableLocator"):
            raise HazardClosureError(f"evidence artifact metadata is invalid: {evidence_id}")


def parse_date(value: Any) -> date | None:
    if not isinstance(value, str):
        return None
    try:
        return date.fromisoformat(value)
    except ValueError:
        return None


def record_blockers(
    hazard: dict[str, Any],
    record: dict[str, Any] | None,
    manifests: dict[str, dict[str, Any]],
    source_commit: str,
    as_of: date,
) -> list[str]:
    if record is None:
        return ["missing-residual-risk-record"]
    blockers: list[str] = []
    if record.get("sourceCommit") != source_commit:
        blockers.append("residual-risk-source-commit-mismatch")
    if record.get("disposition") != "ACCEPT":
        blockers.append("residual-risk-not-accepted")
    if record.get("residualRisk") in {None, "UNASSESSED"}:
        blockers.append("residual-risk-unassessed")
    if not record.get("acceptanceAuthority") or parse_date(record.get("acceptedAt")) is None:
        blockers.append("acceptance-decision-incomplete")
    review_due = parse_date(record.get("reviewDueAt"))
    if review_due is None:
        blockers.append("review-date-invalid")
    elif review_due < as_of:
        blockers.append("acceptance-expired")
    verified_values = record.get("verifiedControlRequirementIds")
    verified = set(verified_values) if isinstance(verified_values, list) else set()
    if not set(hazard["safetyRequirements"]).issubset(verified):
        blockers.append("safety-controls-unverified")
    blockers.extend(manifest_blockers(hazard["id"], record.get("evidenceManifestIds"), manifests))
    return blockers


def manifest_blockers(hazard_id: str, evidence_ids: Any, manifests: dict[str, dict[str, Any]]) -> list[str]:
    if not isinstance(evidence_ids, list) or not evidence_ids:
        return ["pass-evidence-missing"]
    blockers: list[str] = []
    for evidence_id in evidence_ids:
        manifest = manifests.get(evidence_id)
        if manifest is None:
            blockers.append("evidence-manifest-not-supplied")
        elif manifest.get("verdict") != "PASS" or hazard_id not in manifest.get("hazardIds", []):
            blockers.append("evidence-not-pass-or-hazard-mismatch")
    return sorted(set(blockers))


def evaluate_hazards(
    hazards: dict[str, dict[str, Any]],
    records: dict[str, dict[str, Any]],
    traces: dict[str, list[str]],
    manifests: dict[str, dict[str, Any]],
    source_commit: str,
    as_of: date,
) -> dict[str, Any]:
    results: list[dict[str, Any]] = []
    for hazard_id, hazard in hazards.items():
        blockers: list[str] = []
        if not traces.get(hazard_id):
            blockers.append("missing-requirement-trace")
        if hazard.get("status") != "CLOSED":
            blockers.append("hazard-status-open")
        blockers.extend(record_blockers(hazard, records.get(hazard_id), manifests, source_commit, as_of))
        results.append(
            {
                "hazardId": hazard_id,
                "closed": not blockers,
                "blockers": sorted(set(blockers)),
            }
        )
    closed_count = sum(item["closed"] for item in results)
    invalid_declared_closed = any(
        hazards[item["hazardId"]].get("status") == "CLOSED" and item["blockers"] for item in results
    )
    technical_result = "FAIL" if invalid_declared_closed else "PASS" if closed_count == len(results) else "BLOCKED"
    return {
        "hazardCount": len(results),
        "closedHazardCount": closed_count,
        "closureRatio": closed_count / len(results) if results else 0.0,
        "untracedHazardIds": sorted(hazard_id for hazard_id in hazards if not traces.get(hazard_id)),
        "hazards": results,
        "technicalResult": technical_result,
        "verdict": "FAIL" if technical_result == "FAIL" else "BLOCKED",
    }


def build_report(
    profile: dict[str, Any], manifest_paths: list[Path], source_commit: str, as_of: date
) -> dict[str, Any]:
    validate_profile(profile)
    hazard_log = load_object(input_path(profile, "hazardLog"))
    hazards = unique(hazard_log.get("hazards"), "id", "hazards")
    expected_count = profile["closureRequirements"]["requiredHazardCount"]
    if len(hazards) != expected_count:
        raise HazardClosureError(f"expected {expected_count} controlled hazards")
    lor = load_object(input_path(profile, "levelOfRigor"))
    assignments = unique(lor.get("assignments"), "hazardId", "LOR assignments")
    if set(assignments) != set(hazards) or any(
        assignments[key].get("swci") != hazards[key].get("swci") for key in hazards
    ):
        raise HazardClosureError("hazard LOR assignments are incomplete or inconsistent")
    risk_register = load_object(input_path(profile, "residualRiskRegister"))
    records = unique(risk_register.get("records"), "hazardId", "residual-risk records")
    unknown_records = sorted(set(records) - set(hazards))
    if unknown_records:
        raise HazardClosureError(f"residual-risk records reference unknown hazards: {unknown_records}")
    traceability = load_object(input_path(profile, "traceability"))
    traces = hazard_traces(traceability)
    unknown_traces = sorted(set(traces) - set(hazards))
    if unknown_traces:
        raise HazardClosureError(f"traceability references unknown hazards: {unknown_traces}")
    result = evaluate_hazards(
        hazards,
        records,
        traces,
        load_manifests(manifest_paths, source_commit),
        source_commit,
        as_of,
    )
    return {
        "schemaVersion": OUTPUT_SCHEMA,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "asOfDate": as_of.isoformat(),
        "sourceCommit": source_commit,
        "thresholdStatus": profile["thresholds"]["status"],
        **result,
        "limitations": ["hazard closure threshold and independent system-safety review are not approved"],
    }


def write_immutable(path: Path, document: dict[str, Any]) -> None:
    if not path.is_absolute() or not path.parent.is_dir():
        raise HazardClosureError("output must use an existing absolute directory")
    with path.open("x", encoding="utf-8") as stream:
        json.dump(document, stream, indent=2)
        stream.write("\n")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--manifest", action="append", type=Path, default=[])
    parser.add_argument("--as-of-date", type=date.fromisoformat)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    profile = load_object(PROFILE_PATH)
    validate_profile(profile)
    if args.check:
        print("hazard closure qualification profile passed")
        return 0
    if not args.as_of_date or not args.output:
        parser.error("--as-of-date and --output are required")
    if any(not path.is_absolute() or not path.is_file() for path in args.manifest):
        raise HazardClosureError("every evidence manifest must be an existing absolute file")
    report = build_report(profile, args.manifest, current_commit(), args.as_of_date)
    write_immutable(args.output, report)
    print(json.dumps({"closureRatio": report["closureRatio"], "verdict": report["verdict"]}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
