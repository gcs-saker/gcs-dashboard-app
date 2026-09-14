#!/usr/bin/env python3
from __future__ import annotations

import argparse
import fnmatch
import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import yaml

REPO_ROOT = Path(__file__).resolve().parents[2]
CATALOGUE_PATH = REPO_ROOT / "docs/compliance/architecture/change-impact-ownership.yml"
OUTPUT_SCHEMA = "gcs-saker.change-impact-result.v1"


class ChangeImpactError(RuntimeError):
    pass


def load_object(path: Path) -> dict[str, Any]:
    document = (
        yaml.safe_load(path.read_text(encoding="utf-8")) if path.suffix != ".json" else json.loads(path.read_text())
    )
    if not isinstance(document, dict):
        raise ChangeImpactError(f"{path.name} must contain an object")
    return document


def validate_catalogue(catalogue: dict[str, Any]) -> dict[str, str]:
    if catalogue.get("status") != "CONTROLLED":
        raise ChangeImpactError("ownership catalogue must be controlled")
    entries = catalogue.get("productionOwners")
    if not isinstance(entries, list) or len(entries) != 6:
        raise ChangeImpactError("exactly six production ownership boundaries are required")
    prefixes = {entry.get("prefix"): entry.get("id") for entry in entries if isinstance(entry, dict)}
    if len(prefixes) != len(entries) or any(not value for value in prefixes.values()):
        raise ChangeImpactError("production owner IDs and prefixes must be unique")
    if catalogue.get("thresholds", {}).get("status") != "PROPOSED_NOT_APPROVED":
        raise ChangeImpactError("change-impact threshold must remain proposed")
    return prefixes


def classify_path(path: str, catalogue: dict[str, Any], owners: dict[str, str]) -> str:
    normalized = path.replace("\\", "/")
    if normalized in catalogue["nonProductionPaths"]:
        return "non-production"
    if any(normalized.startswith(prefix) for prefix in catalogue["nonProductionPrefixes"]):
        return "non-production"
    if any(fnmatch.fnmatch(normalized, pattern) for pattern in catalogue["nonProductionPatterns"]):
        return "non-production"
    matches = [owner for prefix, owner in owners.items() if normalized.startswith(prefix)]
    if len(matches) != 1:
        return "unknown"
    return matches[0]


def git_output(*args: str) -> str:
    completed = subprocess.run(["git", *args], cwd=REPO_ROOT, check=True, capture_output=True, text=True, timeout=30)
    return completed.stdout.strip()


def resolve_commit(reference: str) -> str:
    commit = git_output("rev-parse", "--verify", f"{reference}^{{commit}}")
    if len(commit) != 40:
        raise ChangeImpactError(f"reference does not resolve to an immutable commit: {reference}")
    return commit


def require_ancestor(base_commit: str, candidate_commit: str) -> None:
    completed = subprocess.run(
        ["git", "merge-base", "--is-ancestor", base_commit, candidate_commit],
        cwd=REPO_ROOT,
        check=False,
        capture_output=True,
        timeout=30,
    )
    if completed.returncode != 0:
        raise ChangeImpactError("base commit must be an ancestor of the candidate commit")


def changed_paths(base_commit: str, candidate_commit: str) -> list[str]:
    output = git_output("diff", "--name-only", "--no-renames", base_commit, candidate_commit, "--")
    return sorted({line for line in output.splitlines() if line})


def validate_disposition(path: Path, candidate: str, change_id: str, cross_paths: list[str]) -> dict[str, str]:
    document = load_object(path)
    required = ("reviewer", "decision", "rationale")
    if document.get("candidateCommit") != candidate or document.get("changeId") != change_id:
        raise ChangeImpactError("disposition candidate or change ID does not match")
    if sorted(document.get("crossBoundaryPaths", [])) != cross_paths:
        raise ChangeImpactError("disposition does not cover the exact cross-boundary paths")
    if document.get("decision") not in {"ACCEPT", "REJECT"} or any(not document.get(field) for field in required):
        raise ChangeImpactError("disposition requires reviewer decision and rationale")
    return {field: str(document[field]) for field in required}


def evaluate_changes(
    paths: list[str], catalogue: dict[str, Any], expected_owner: str, disposition: dict[str, str] | None
) -> dict[str, Any]:
    owners = validate_catalogue(catalogue)
    if expected_owner not in owners.values():
        raise ChangeImpactError(f"unknown expected owner: {expected_owner}")
    classified = [{"path": path, "owner": classify_path(path, catalogue, owners)} for path in paths]
    unknown = sorted(item["path"] for item in classified if item["owner"] == "unknown")
    production = [item for item in classified if item["owner"] not in {"unknown", "non-production"}]
    cross_paths = sorted(item["path"] for item in production if item["owner"] != expected_owner)
    modified_owners = sorted({item["owner"] for item in production})
    if unknown or disposition and disposition["decision"] == "REJECT":
        technical_result = "FAIL"
    elif cross_paths and disposition is None:
        technical_result = "REVIEW_REQUIRED"
    else:
        technical_result = "PASS"
    return {
        "changedFileCount": len(paths),
        "modifiedProductionFileCount": len(production),
        "modifiedProductionOwners": modified_owners,
        "crossBoundaryProductionOwners": sorted(set(modified_owners) - {expected_owner}),
        "crossBoundaryPaths": cross_paths,
        "unknownPaths": unknown,
        "technicalResult": technical_result,
        "verdict": "FAIL" if technical_result == "FAIL" else "BLOCKED",
    }


def build_report(
    *, base: str, candidate: str, expected_owner: str, change_id: str, disposition_path: Path | None
) -> dict[str, Any]:
    catalogue = load_object(CATALOGUE_PATH)
    owners = validate_catalogue(catalogue)
    base_commit = resolve_commit(base)
    candidate_commit = resolve_commit(candidate)
    require_ancestor(base_commit, candidate_commit)
    paths = changed_paths(base_commit, candidate_commit)
    preview = evaluate_changes(paths, catalogue, expected_owner, None)
    disposition = None
    if disposition_path:
        disposition = validate_disposition(disposition_path, candidate_commit, change_id, preview["crossBoundaryPaths"])
    result = evaluate_changes(paths, catalogue, expected_owner, disposition)
    return {
        "schemaVersion": OUTPUT_SCHEMA,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "changeId": change_id,
        "baseCommit": base_commit,
        "candidateCommit": candidate_commit,
        "expectedOwner": expected_owner,
        "knownOwners": sorted(owners.values()),
        "thresholdStatus": catalogue["thresholds"]["status"],
        "disposition": disposition,
        **result,
        "limitations": ["threshold and independent architecture evaluation are not approved"],
    }


def write_immutable(path: Path, report: dict[str, Any]) -> None:
    if not path.is_absolute() or not path.parent.is_dir():
        raise ChangeImpactError("output must use an existing absolute directory")
    with path.open("x", encoding="utf-8") as stream:
        json.dump(report, stream, indent=2)
        stream.write("\n")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--base-ref")
    parser.add_argument("--candidate-ref")
    parser.add_argument("--expected-owner")
    parser.add_argument("--change-id")
    parser.add_argument("--disposition", type=Path)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    catalogue = load_object(CATALOGUE_PATH)
    owners = validate_catalogue(catalogue)
    if args.check:
        print(f"change-impact ownership contract passed for {len(owners)} production boundaries")
        return 0
    required = (args.base_ref, args.candidate_ref, args.expected_owner, args.change_id, args.output)
    if any(value is None for value in required):
        parser.error("base, candidate, expected owner, change ID, and output are required")
    if args.disposition and (not args.disposition.is_absolute() or not args.disposition.is_file()):
        raise ChangeImpactError("disposition must be an existing absolute file")
    report = build_report(
        base=args.base_ref,
        candidate=args.candidate_ref,
        expected_owner=args.expected_owner,
        change_id=args.change_id,
        disposition_path=args.disposition,
    )
    write_immutable(args.output, report)
    print(json.dumps({"technicalResult": report["technicalResult"], "verdict": report["verdict"]}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
