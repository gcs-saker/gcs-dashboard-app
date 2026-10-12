from __future__ import annotations

import hashlib
import json
from collections import Counter
from pathlib import Path
from typing import Any

import yaml

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
    expected_services = {
        "postgres-geo",
        "redis",
        "mqtt",
        "mediamtx",
        "auth-policy",
        "media-control",
    }
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
