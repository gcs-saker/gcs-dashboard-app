import importlib.util
import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts/ops/audit_offload_restore_drill.py"


def load_module():
    for directory in (ROOT / "scripts/ops",):
        sys.path.insert(0, str(directory))
    spec = importlib.util.spec_from_file_location("audit_offload_restore_drill", SCRIPT)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def test_contract_check_is_non_mutating(capsys: pytest.CaptureFixture[str], monkeypatch: pytest.MonkeyPatch) -> None:
    module = load_module()
    monkeypatch.setattr(sys, "argv", [str(SCRIPT), "--check"])

    assert module.main() == 0
    assert "contract check passed" in capsys.readouterr().out


def test_same_device_offload_is_rejected(tmp_path: Path) -> None:
    module = load_module()
    original = tmp_path / "audit.jsonl"
    key = tmp_path / "anchor.key"
    anchors = tmp_path / "anchors"
    external = tmp_path / "external"
    restore = tmp_path / "restore"
    for directory in (anchors, external, restore):
        directory.mkdir()
    original.write_text("{}\n", encoding="utf-8")
    key.write_bytes(b"k" * 32)
    inputs = module.DrillInputs(original, anchors, key, external, restore, tmp_path / "result.json")

    with pytest.raises(module.AuditDrillError, match="different mounted device"):
        module.validate_inputs(inputs)


def test_evidence_is_owner_only_and_never_overwritten(tmp_path: Path) -> None:
    module = load_module()
    output = tmp_path / "result.json"
    module.write_evidence(output, {"result": "PASS"})

    assert json.loads(output.read_text(encoding="utf-8")) == {"result": "PASS"}
    if module.os.name != "nt":
        assert output.stat().st_mode & 0o077 == 0
    with pytest.raises(FileExistsError):
        module.write_evidence(output, {"result": "FAIL"})


def test_latest_anchor_selection_uses_sequence_not_mtime(tmp_path: Path) -> None:
    module = load_module()
    older = tmp_path / "anchor-00000000000000000002.json"
    latest = tmp_path / "anchor-00000000000000000003.json"
    older.write_text("{}", encoding="utf-8")
    latest.write_text("{}", encoding="utf-8")
    older.touch()

    assert module.latest_anchor(tmp_path) == latest
