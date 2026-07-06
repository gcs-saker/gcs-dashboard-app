from pathlib import Path
import subprocess


REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPT = REPO_ROOT / "scripts" / "smoke" / "turnutils_relay_smoke.sh"


def test_turnutils_relay_smoke_script_has_valid_bash_syntax() -> None:
    result = subprocess.run(
        ["bash", "-n", str(SCRIPT)],
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr


def test_turnutils_relay_smoke_uses_coturn_client_and_allocation_logs() -> None:
    content = SCRIPT.read_text(encoding="utf-8")

    assert "turnutils_uclient" in content
    assert "WEBRTC_TURN_USERNAME" in content
    assert "WEBRTC_TURN_PASSWORD" in content
    assert "Global turn allocation count incremented" in content
    assert "49160" not in content
