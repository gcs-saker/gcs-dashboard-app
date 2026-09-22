import base64
import hashlib
import importlib.util
import json
import sys
from datetime import datetime
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts/ops/s3_object_lock_offload.py"


def load_module():
    spec = importlib.util.spec_from_file_location("s3_object_lock_offload", SCRIPT)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def request(module, tmp_path: Path, retention_days: int = 365):
    anchor = tmp_path / "anchor-00000000000000000001.json"
    anchor.write_text('{"sequence":1}\n', encoding="utf-8")
    return module.OffloadRequest(anchor, "audit-lock-bucket", "anchors", retention_days, tmp_path / "result.json")


def successful_aws(module, anchor: Path):
    digest = hashlib.sha256(anchor.read_bytes()).digest()
    checksum = base64.b64encode(digest).decode("ascii")
    calls: list[list[str]] = []

    def fake(arguments: list[str]):
        calls.append(arguments)
        if arguments[0] == "get-bucket-versioning":
            return {"Status": "Enabled"}
        if arguments[0] == "get-object-lock-configuration":
            return {"ObjectLockConfiguration": {"ObjectLockEnabled": "Enabled"}}
        if arguments[0] == "put-object":
            return {"VersionId": "version-1"}
        retain_until = calls[-2][calls[-2].index("--object-lock-retain-until-date") + 1]
        return {
            "ObjectLockMode": "COMPLIANCE",
            "ObjectLockRetainUntilDate": retain_until,
            "ChecksumSHA256": checksum,
            "Metadata": {"sha256": digest.hex()},
        }

    return fake, calls


def test_compliance_locked_version_is_uploaded_and_verified(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    module = load_module()
    value = request(module, tmp_path)
    fake, calls = successful_aws(module, value.anchor)
    monkeypatch.setattr(module, "run_aws", fake)

    result = module.offload(value)

    assert result["result"] == "PASS"
    assert result["retentionMode"] == "COMPLIANCE"
    assert json.loads(value.evidence_output.read_text(encoding="utf-8"))["versionId"] == "version-1"
    put = next(call for call in calls if call[0] == "put-object")
    head = next(call for call in calls if call[0] == "head-object")
    assert "--checksum-algorithm" in put and "SHA256" in put
    assert "--object-lock-mode" in put and "COMPLIANCE" in put
    assert "--version-id" in head and "version-1" in head
    assert all("bypass-governance" not in value for call in calls for value in call)


def test_short_retention_and_same_output_are_rejected(tmp_path: Path) -> None:
    module = load_module()
    short = request(module, tmp_path, 29)
    with pytest.raises(module.ObjectLockError, match="at least 30 days"):
        module.validate_request(short)
    short.evidence_output.write_text("{}", encoding="utf-8")
    with pytest.raises(module.ObjectLockError, match="new and absolute"):
        module.validate_request(short)


@pytest.mark.parametrize(
    ("versioning", "lock", "message"),
    [("Suspended", "Enabled", "versioning"), ("Enabled", "Disabled", "Object Lock")],
)
def test_bucket_preconditions_fail_closed(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    versioning: str,
    lock: str,
    message: str,
) -> None:
    module = load_module()
    value = request(module, tmp_path)
    responses = iter(({"Status": versioning}, {"ObjectLockConfiguration": {"ObjectLockEnabled": lock}}))
    monkeypatch.setattr(module, "run_aws", lambda _: next(responses))

    with pytest.raises(module.ObjectLockError, match=message):
        module.require_locked_versioned_bucket(value)


def test_head_response_must_match_compliance_checksum_and_retention(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    module = load_module()
    value = request(module, tmp_path)
    fake, _ = successful_aws(module, value.anchor)
    monkeypatch.setattr(module, "run_aws", fake)
    retain_until = datetime.fromisoformat("2027-09-22T00:00:00+00:00")

    with pytest.raises(module.ObjectLockError, match="COMPLIANCE"):
        monkeypatch.setattr(
            module, "run_aws", lambda _: {"ObjectLockMode": "GOVERNANCE"}
        ) or module.verify_uploaded_version(
            value,
            "key",
            "version",
            "hex",
            "checksum",
            retain_until,
        )
