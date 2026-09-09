from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
GENERATOR = ROOT / "scripts/ops/generate_admin_mfa_material.py"
RUNBOOK = ROOT / "docs/operations/GCS-Saker_Admin_MFA_Recovery_Runbook.md"


def test_mfa_material_generator_is_owner_only_and_outside_source() -> None:
    source = GENERATOR.read_text(encoding="utf-8")

    assert "MFA material must be written outside the repository" in source
    assert "refusing to overwrite" in source
    assert "os.O_EXCL" in source
    assert "0o600" in source
    assert "secrets.token_bytes(20)" in source
    assert "range(10)" in source


def test_admin_recovery_runbook_never_uses_mfa_disable_as_recovery() -> None:
    runbook = RUNBOOK.read_text(encoding="utf-8")

    assert "replay is rejected before access" in runbook
    assert "security version" in runbook
    assert "two\nauthorized people" in runbook
    assert "is not an approved recovery" in runbook
