import hashlib
import hmac
import importlib.util
import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts/ops/verify_audit_recovery.py"
CHAIN = ROOT / "scripts/ops/audit_chain_verify.py"


def load_module():
    sys.path.insert(0, str(CHAIN.parent))
    spec = importlib.util.spec_from_file_location("verify_audit_recovery", SCRIPT)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def write_fixture(tmp_path: Path) -> tuple[Path, Path, Path, Path]:
    chain_module = __import__("audit_chain_verify")
    record = {"sequence": 1, "previousHash": "0" * 64, "eventCode": "AUTH_DENIED"}
    record["recordHash"] = chain_module.calculate_record_hash(record)
    original = tmp_path / "original.jsonl"
    restored = tmp_path / "restored.jsonl"
    encoded = json.dumps(record) + "\n"
    original.write_text(encoded, encoding="utf-8")
    restored.write_text(encoded, encoding="utf-8")
    key = tmp_path / "anchor.key"
    key.write_bytes(b"k" * 32)
    key.chmod(0o600)
    anchor = {
        "sequence": 1,
        "previousAnchorHash": "0" * 64,
        "chainHead": record["recordHash"],
        "recordCount": 1,
        "anchoredAt": "2026-09-09T00:00:00Z",
        "sourceCommit": "a" * 40,
    }
    payload = "|".join(str(anchor[field]) for field in anchor).encode()
    anchor["anchorHash"] = hashlib.sha256(payload).hexdigest()
    anchor["signature"] = hmac.new(key.read_bytes(), str(anchor["anchorHash"]).encode(), hashlib.sha256).hexdigest()
    anchor_path = tmp_path / "anchor.json"
    anchor_path.write_text(json.dumps(anchor), encoding="utf-8")
    return original, restored, anchor_path, key


def test_restored_chain_and_anchor_are_verified(tmp_path: Path) -> None:
    module = load_module()
    assert module.verify_recovery(*write_fixture(tmp_path)) == 1


def test_recovery_rejects_changed_records(tmp_path: Path) -> None:
    module = load_module()
    original, restored, anchor, key = write_fixture(tmp_path)
    restored.write_text(restored.read_text().replace("AUTH_DENIED", "AUTH_ALLOWED"), encoding="utf-8")
    with pytest.raises(Exception, match="hash|differ"):
        module.verify_recovery(original, restored, anchor, key)
