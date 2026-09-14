#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import os
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import yaml

REPO_ROOT = Path(__file__).resolve().parents[2]
PROFILE_PATH = REPO_ROOT / "docs/compliance/quality/recovery-qualification-profile.yml"
COMPOSE_PATH = REPO_ROOT / "deploy/compose/compose.single-node.poc.yml"
REQUIRED_TARGET = "server01-production"


class RecoveryQualificationError(RuntimeError):
    pass


def load_document(path: Path) -> dict[str, Any]:
    if path.suffix == ".json":
        document = json.loads(path.read_text(encoding="utf-8"))
    else:
        document = yaml.safe_load(path.read_text(encoding="utf-8"))
    if not isinstance(document, dict):
        raise RecoveryQualificationError(f"{path.name} must contain an object")
    return document


def validate_profile(profile: dict[str, Any]) -> dict[str, dict[str, Any]]:
    if profile.get("status") != "CONTROLLED_DRAFT_NOT_EXECUTED":
        raise RecoveryQualificationError("recovery profile must remain an unexecuted draft")
    if profile.get("target") != REQUIRED_TARGET:
        raise RecoveryQualificationError("only Server-01 production is permitted")
    scenarios = _index(profile.get("scenarios"), "recovery scenarios")
    expected_services = {"postgres-geo", "redis", "mqtt", "mediamtx", "auth-policy", "media-control"}
    if {entry.get("service") for entry in scenarios.values()} != expected_services:
        raise RecoveryQualificationError("recovery service coverage is incomplete")
    thresholds = profile.get("thresholds", {})
    if thresholds.get("status") != "PROPOSED_NOT_APPROVED":
        raise RecoveryQualificationError("recovery thresholds must remain proposed")
    if profile.get("execution", {}).get("recreateContainers") is not False:
        raise RecoveryQualificationError("recovery scenarios must preserve container identity")
    return scenarios


def _index(entries: Any, label: str) -> dict[str, dict[str, Any]]:
    if not isinstance(entries, list) or not entries:
        raise RecoveryQualificationError(f"{label} must be a non-empty list")
    indexed = {entry.get("id"): entry for entry in entries if isinstance(entry, dict)}
    if len(indexed) != len(entries) or None in indexed:
        raise RecoveryQualificationError(f"{label} IDs must be present and unique")
    return indexed


def reconcile_records(accepted: list[str], recovered: list[str]) -> dict[str, Any]:
    if not accepted or any(not isinstance(value, str) or not value for value in accepted):
        raise RecoveryQualificationError("accepted IDs must be non-empty strings")
    if len(accepted) != len(set(accepted)):
        raise RecoveryQualificationError("accepted IDs must be unique")
    if any(not isinstance(value, str) or not value for value in recovered):
        raise RecoveryQualificationError("recovered IDs must be non-empty strings")
    recovered_counts = Counter(recovered)
    missing = sorted(set(accepted) - set(recovered_counts))
    duplicates = sorted(key for key, count in recovered_counts.items() if count > 1)
    unexpected = sorted(set(recovered_counts) - set(accepted))
    technical_result = "PASS" if not missing and not duplicates and not unexpected else "FAIL"
    return {
        "acceptedCount": len(accepted),
        "recoveredCount": len(recovered),
        "missingIds": missing,
        "duplicateIds": duplicates,
        "unexpectedIds": unexpected,
        "unrecoverableAcceptedRecords": len(missing),
        "technicalResult": technical_result,
        "verdict": "BLOCKED" if technical_result == "PASS" else "FAIL",
    }


def verify_backup(path: Path, source_commit: str) -> str:
    result = load_document(path)
    if result.get("sourceCommit") != source_commit or result.get("restoreVerified") is not True:
        raise RecoveryQualificationError("backup restore evidence is absent or belongs to another commit")
    digest = result.get("databaseDumpSha256")
    if not isinstance(digest, str) or len(digest) != 64:
        raise RecoveryQualificationError("backup evidence requires a database dump SHA-256")
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load_record_ids(path: Path, source_commit: str) -> list[str]:
    document = load_document(path)
    if document.get("schemaVersion") != "gcs-saker.record-id-set.v1":
        raise RecoveryQualificationError(f"unsupported record ID evidence: {path}")
    if document.get("sourceCommit") != source_commit:
        raise RecoveryQualificationError(f"record ID evidence commit mismatch: {path}")
    record_ids = document.get("ids")
    if not isinstance(record_ids, list):
        raise RecoveryQualificationError(f"record ID evidence requires an IDs list: {path}")
    return record_ids


def build_reconciliation(accepted_path: Path, recovered_path: Path) -> dict[str, Any]:
    source_commit = _source_commit()
    result = reconcile_records(
        load_record_ids(accepted_path, source_commit),
        load_record_ids(recovered_path, source_commit),
    )
    return {
        "schemaVersion": "gcs-saker.recovery-reconciliation.v1",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "sourceCommit": source_commit,
        "thresholdStatus": "PROPOSED_NOT_APPROVED",
        "artifacts": [
            {"path": str(accepted_path), "sha256": hashlib.sha256(accepted_path.read_bytes()).hexdigest()},
            {"path": str(recovered_path), "sha256": hashlib.sha256(recovered_path.read_bytes()).hexdigest()},
        ],
        **result,
    }


def validate_execution(args: argparse.Namespace, source_commit: str) -> str:
    if args.target != REQUIRED_TARGET or os.getenv("DEPLOYMENT_TARGET") != REQUIRED_TARGET:
        raise RecoveryQualificationError("DEPLOYMENT_TARGET and --target must identify Server-01 production")
    if not args.approved_window or not args.approved_window.strip():
        raise RecoveryQualificationError("an approved maintenance window ID is required")
    if args.project_name != "gcs-saker-m2-production":
        raise RecoveryQualificationError("production Compose project name is fixed")
    origin = urllib.parse.urlparse(args.public_base_url)
    if origin.scheme != "https" or origin.hostname != "gcs-saker.com":
        raise RecoveryQualificationError("public recovery probes must use the production HTTPS origin")
    for path, label in ((args.env_file, "environment file"), (args.backup_result, "backup result")):
        if path is None or not path.is_absolute() or not path.is_file():
            raise RecoveryQualificationError(f"{label} must be an existing absolute file")
    if args.evidence_dir is None or not args.evidence_dir.is_absolute() or not args.evidence_dir.is_dir():
        raise RecoveryQualificationError("evidence directory must be an existing absolute directory")
    return verify_backup(args.backup_result, source_commit)


def compose_command(args: argparse.Namespace, *parts: str) -> list[str]:
    return [
        "docker",
        "compose",
        "--project-name",
        args.project_name,
        "--env-file",
        str(args.env_file),
        "-f",
        str(COMPOSE_PATH),
        *parts,
    ]


def run_command(command: list[str], timeout: int = 30) -> str:
    completed = subprocess.run(command, cwd=REPO_ROOT, check=True, capture_output=True, text=True, timeout=timeout)
    return completed.stdout.strip()


def container_state(container_id: str) -> tuple[str, str]:
    output = run_command(
        [
            "docker",
            "inspect",
            "--format",
            "{{.State.Status}}|{{if .State.Health}}{{.State.Health.Status}}{{end}}",
            container_id,
        ]
    )
    status, health = output.split("|", 1)
    return status, health


def wait_for_recovery(container_id: str, attempts: int, interval_seconds: int) -> None:
    for _ in range(attempts):
        status, health = container_state(container_id)
        if status == "running" and health in {"", "healthy"}:
            return
        time.sleep(interval_seconds)
    raise RecoveryQualificationError("service did not recover within the bounded observation window")


def probe(url: str, expected_status: int) -> dict[str, Any]:
    request = urllib.request.Request(url, headers={"User-Agent": "gcs-saker-recovery-qualification/1"})
    try:
        with urllib.request.urlopen(request, timeout=5) as response:
            actual_status = response.status
    except urllib.error.HTTPError as error:
        actual_status = error.code
    except urllib.error.URLError:
        actual_status = 0
    return {
        "urlPath": urllib.parse.urlparse(url).path,
        "expectedStatus": expected_status,
        "actualStatus": actual_status,
        "passed": actual_status == expected_status,
    }


def run_probes(profile: dict[str, Any], public_base_url: str) -> list[dict[str, Any]]:
    origin = public_base_url.rstrip("/")
    return [probe(origin + item["path"], item["expectedStatus"]) for item in profile["execution"]["publicProbes"]]


def evaluate_recovery(
    *, fault_observed: bool, container_preserved: bool, post_probes: list[dict[str, Any]], duration: float, rto: int
) -> str:
    probes_passed = all(item["passed"] for item in post_probes)
    within_rto = duration <= rto
    return "PASS" if fault_observed and container_preserved and probes_passed and within_rto else "FAIL"


def run_scenario(args: argparse.Namespace, profile: dict[str, Any], scenario: dict[str, Any]) -> dict[str, Any]:
    source_commit = _source_commit()
    backup_sha256 = validate_execution(args, source_commit)
    service = scenario["service"]
    container_id = run_command(compose_command(args, "ps", "-q", service))
    if not container_id:
        raise RecoveryQualificationError(f"service is not running: {service}")
    pre_probes = run_probes(profile, args.public_base_url)
    if not all(item["passed"] for item in pre_probes):
        raise RecoveryQualificationError("pre-injection public probes must pass")
    started_at = datetime.now(timezone.utc)
    run_command(compose_command(args, "stop", "--timeout", "30", service), timeout=45)
    stopped_status, _ = container_state(container_id)
    fault_observed = stopped_status != "running"
    during_probes = run_probes(profile, args.public_base_url)
    try:
        run_command(compose_command(args, "start", service), timeout=60)
        execution = profile["execution"]
        wait_for_recovery(container_id, execution["maximumAttempts"], execution["retryIntervalSeconds"])
    finally:
        status, _ = container_state(container_id)
        if status != "running":
            run_command(compose_command(args, "start", service), timeout=60)
    recovered_at = datetime.now(timezone.utc)
    post_probes = run_probes(profile, args.public_base_url)
    current_id = run_command(compose_command(args, "ps", "-q", service))
    recovery_duration = (recovered_at - started_at).total_seconds()
    technical_result = evaluate_recovery(
        fault_observed=fault_observed,
        container_preserved=current_id == container_id,
        post_probes=post_probes,
        duration=recovery_duration,
        rto=profile["thresholds"]["recoveryTimeObjectiveSeconds"],
    )
    return {
        "schemaVersion": "gcs-saker.recovery-result.v1",
        "scenarioId": scenario["id"],
        "sourceCommit": source_commit,
        "approvedWindowId": args.approved_window,
        "backupResultSha256": backup_sha256,
        "startedAt": started_at.isoformat(),
        "recoveredAt": recovered_at.isoformat(),
        "recoveryDurationSeconds": recovery_duration,
        "containerIdPreserved": current_id == container_id,
        "faultObserved": fault_observed,
        "preProbes": pre_probes,
        "duringProbes": during_probes,
        "postProbes": post_probes,
        "technicalResult": technical_result,
        "verdict": "BLOCKED" if technical_result == "PASS" else "FAIL",
        "limitations": ["thresholds and independent assessment are not approved"],
    }


def write_immutable(output: Path, document: dict[str, Any]) -> None:
    if not output.is_absolute() or not output.parent.is_dir():
        raise RecoveryQualificationError("output must be inside an existing absolute directory")
    with output.open("x", encoding="utf-8") as stream:
        json.dump(document, stream, indent=2)
        stream.write("\n")


def _source_commit() -> str:
    return run_command(["git", "rev-parse", "HEAD"])


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--reconcile", action="store_true")
    parser.add_argument("--target")
    parser.add_argument("--scenario")
    parser.add_argument("--approved-window")
    parser.add_argument("--env-file", type=Path)
    parser.add_argument("--backup-result", type=Path)
    parser.add_argument("--evidence-dir", type=Path)
    parser.add_argument("--accepted", type=Path)
    parser.add_argument("--recovered", type=Path)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--project-name", default="gcs-saker-m2-production")
    parser.add_argument("--public-base-url", default="https://gcs-saker.com")
    args = parser.parse_args()
    profile = load_document(PROFILE_PATH)
    scenarios = validate_profile(profile)
    if args.check:
        print(f"recovery qualification profile passed for {len(scenarios)} scenarios")
        return 0
    if args.reconcile:
        if not args.accepted or not args.recovered or not args.output:
            parser.error("--accepted, --recovered, and --output are required")
        write_immutable(args.output, build_reconciliation(args.accepted, args.recovered))
        print(f"recovery reconciliation written: {args.output}")
        return 0
    if args.scenario not in scenarios:
        parser.error("--scenario must identify one controlled scenario")
    result = run_scenario(args, profile, scenarios[args.scenario])
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    write_immutable(args.evidence_dir / f"{args.scenario}-{timestamp}.json", result)
    print(json.dumps({"scenarioId": args.scenario, "verdict": result["verdict"]}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
