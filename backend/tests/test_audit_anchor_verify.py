import hashlib
import hmac
import importlib.util
import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts/ops/audit_anchor_verify.py"


def load_module():
    spec = importlib.util.spec_from_file_location("audit_anchor_verify", SCRIPT)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def write_chain(tmp_path: Path, count: int = 3):
    module = load_module()
    directory = tmp_path / "anchors"
    directory.mkdir()
    key_path = tmp_path / "anchor.key"
    key_path.write_bytes(b"k" * 32)
    key_path.chmod(0o600)
    previous_hash = "0" * 64
    for sequence in range(1, count + 1):
        anchor = {
            "sequence": sequence,
            "previousAnchorHash": previous_hash,
            "chainHead": f"{sequence:064x}",
            "recordCount": sequence * 10,
            "anchoredAt": f"2026-09-21T00:{sequence:02d}:00Z",
            "sourceCommit": "a" * 40,
        }
        anchor_hash = hashlib.sha256(module.canonical_payload(anchor)).hexdigest()
        anchor["anchorHash"] = anchor_hash
        anchor["signature"] = hmac.new(key_path.read_bytes(), anchor_hash.encode("ascii"), hashlib.sha256).hexdigest()
        path = directory / f"anchor-{sequence:020d}.json"
        path.write_text(json.dumps(anchor) + "\n", encoding="utf-8")
        previous_hash = anchor_hash
    return module, directory, key_path


def write_checkpoint(directory: Path, path: Path) -> Path:
    latest = json.loads((directory / "anchor-00000000000000000003.json").read_text(encoding="utf-8"))
    path.write_text(json.dumps({"sequence": latest["sequence"], "anchorHash": latest["anchorHash"]}), encoding="utf-8")
    return path


def test_complete_anchor_directory_is_verified(tmp_path: Path) -> None:
    module, directory, key_path = write_chain(tmp_path)

    assert module.verify_anchor_directory(directory, module.require_private_key(key_path), "a" * 40) == 3


def test_java_instant_nanoseconds_are_accepted() -> None:
    module = load_module()

    parsed = module.parse_timestamp("2026-09-17T01:12:10.602155252Z")

    assert parsed.isoformat() == "2026-09-17T01:12:10.602155+00:00"


@pytest.mark.parametrize("field", ["chainHead", "recordCount", "anchoredAt", "sourceCommit"])
def test_payload_tampering_is_rejected(tmp_path: Path, field: str) -> None:
    module, directory, key_path = write_chain(tmp_path)
    path = directory / "anchor-00000000000000000003.json"
    anchor = json.loads(path.read_text(encoding="utf-8"))
    anchor[field] = "tampered" if field != "recordCount" else 999
    path.write_text(json.dumps(anchor), encoding="utf-8")

    with pytest.raises(module.AuditAnchorError, match="hash|timestamp"):
        module.verify_anchor_directory(directory, module.require_private_key(key_path))


def test_wrong_key_is_rejected_before_extension(tmp_path: Path) -> None:
    module, directory, _ = write_chain(tmp_path)

    with pytest.raises(module.AuditAnchorError, match="signature"):
        module.verify_anchor_directory(directory, b"z" * 32)


def test_deleted_middle_anchor_is_rejected(tmp_path: Path) -> None:
    module, directory, key_path = write_chain(tmp_path)
    (directory / "anchor-00000000000000000002.json").unlink()

    with pytest.raises(module.AuditAnchorError, match="filename sequence"):
        module.verify_anchor_directory(directory, module.require_private_key(key_path))


def test_deleted_latest_anchor_is_rejected_by_independent_checkpoint(tmp_path: Path) -> None:
    module, directory, key_path = write_chain(tmp_path)
    checkpoint = write_checkpoint(directory, tmp_path / "checkpoint.json")
    (directory / "anchor-00000000000000000003.json").unlink()

    with pytest.raises(module.AuditAnchorError, match="checkpoint"):
        module.verify_anchor_directory(directory, module.require_private_key(key_path), checkpoint_path=checkpoint)


def test_malformed_anchor_filename_is_rejected(tmp_path: Path) -> None:
    module, directory, key_path = write_chain(tmp_path)
    (directory / "anchor-latest.json").write_text("{}", encoding="utf-8")

    with pytest.raises(module.AuditAnchorError, match="filename"):
        module.verify_anchor_directory(directory, module.require_private_key(key_path))


def test_reordered_anchor_content_is_rejected(tmp_path: Path) -> None:
    module, directory, key_path = write_chain(tmp_path)
    first = directory / "anchor-00000000000000000001.json"
    second = directory / "anchor-00000000000000000002.json"
    first_payload = first.read_bytes()
    first.write_bytes(second.read_bytes())
    second.write_bytes(first_payload)

    with pytest.raises(module.AuditAnchorError, match="content sequence"):
        module.verify_anchor_directory(directory, module.require_private_key(key_path))


def test_record_count_and_timestamp_regression_are_rejected(tmp_path: Path) -> None:
    module, directory, key_path = write_chain(tmp_path)
    second = directory / "anchor-00000000000000000002.json"
    anchor = json.loads(second.read_text(encoding="utf-8"))
    anchor["recordCount"] = 1
    anchor_hash = hashlib.sha256(module.canonical_payload(anchor)).hexdigest()
    anchor["anchorHash"] = anchor_hash
    anchor["signature"] = hmac.new(key_path.read_bytes(), anchor_hash.encode("ascii"), hashlib.sha256).hexdigest()
    second.write_text(json.dumps(anchor), encoding="utf-8")

    with pytest.raises(module.AuditAnchorError, match="record count"):
        module.verify_anchor_directory(directory, module.require_private_key(key_path))


def test_group_readable_hmac_key_is_rejected(tmp_path: Path) -> None:
    module, _, key_path = write_chain(tmp_path)
    key_path.chmod(0o640)

    if module.os.name == "nt":
        pytest.skip("POSIX mode bits are not authoritative on Windows")
    with pytest.raises(module.AuditAnchorError, match="permissions"):
        module.require_private_key(key_path)
