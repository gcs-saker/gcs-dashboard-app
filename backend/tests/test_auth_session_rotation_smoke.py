from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts/smoke/auth_session_rotation_smoke.py"


def test_auth_session_smoke_requires_rotation_replay_denial_and_logout_revocation() -> None:
    source = SCRIPT.read_text(encoding="utf-8")

    assert '"rotate": 200' in source
    assert '"rotated": True' in source
    assert '"replay": 401' in source
    assert '"logout": 204' in source
    assert '"revoked": 401' in source
    assert "AUTH_SMOKE_PASSWORD" in source
