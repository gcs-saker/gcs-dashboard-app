import runpy
from copy import deepcopy
from pathlib import Path
from typing import Any, Callable, cast

import pytest
import yaml

REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPT = REPO_ROOT / "scripts/ops/audit_chain_verify.py"
POLICY = REPO_ROOT / "docs/compliance/security/audit-integrity-policy.yml"
MODULE = runpy.run_path(str(SCRIPT))
AuditChainError = cast(type[BaseException], MODULE["AuditChainError"])
calculate_record_hash = cast(Callable[[dict[str, Any]], str], MODULE["calculate_record_hash"])
verify_records = cast(Callable[[list[dict[str, Any]]], int], MODULE["verify_records"])


def chained_records() -> list[dict[str, Any]]:
    first: dict[str, Any] = {"sequence": 1, "previousHash": "0" * 64, "eventCode": "AUTH_DENIED"}
    first["recordHash"] = calculate_record_hash(first)
    second: dict[str, Any] = {"sequence": 2, "previousHash": first["recordHash"], "eventCode": "LOGIN_OK"}
    second["recordHash"] = calculate_record_hash(second)
    return [first, second]


def test_audit_chain_accepts_contiguous_untampered_records() -> None:
    assert verify_records(chained_records()) == 2


def test_audit_chain_rejects_payload_tampering() -> None:
    records = deepcopy(chained_records())
    records[0]["eventCode"] = "AUTH_ALLOWED"

    with pytest.raises(AuditChainError, match="record hash"):
        verify_records(records)


def test_audit_chain_rejects_removed_or_reordered_records() -> None:
    with pytest.raises(AuditChainError, match="sequence"):
        verify_records(chained_records()[1:])


def test_audit_policy_forbids_credentials_and_does_not_claim_external_immutability() -> None:
    policy = yaml.safe_load(POLICY.read_text(encoding="utf-8"))

    assert {"password", "bearerToken", "deviceCredential", "rawAudio"} <= set(policy["forbiddenFields"])
    assert policy["integrity"]["externalAnchor"] == "SOFTWARE_WORM_STAGING_IMPLEMENTED"
    assert policy["integrity"]["externalImmutableStorage"] == "REQUIRED_NOT_IMPLEMENTED"
    assert policy["currentStatus"] == "SOFTWARE_WORM_STAGING_EXTERNAL_IMMUTABILITY_OPEN"
    assert policy["integrity"]["protectedCategories"] == ["security", "audit"]
