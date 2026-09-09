from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts/ops/offload_audit_anchor.sh"


def test_audit_offload_requires_independent_storage_and_capacity_headroom() -> None:
    source = SCRIPT.read_text(encoding="utf-8")

    assert "different mounted device" in source
    assert "usage >= 75" in source
    assert "overwrite denied" in source
    assert 'install -m 400 "${latest}"' in source
    assert "sha256sum" in source
    assert "digest mismatch" in source
