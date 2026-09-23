import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts/smoke/control_command_e2e.sh"


def test_control_command_e2e_contract_check_passes() -> None:
    result = subprocess.run(["bash", str(SCRIPT), "--check"], cwd=ROOT, check=True, capture_output=True, text=True)

    assert "control command E2E contract check passed" in result.stdout


def test_control_command_e2e_covers_required_boundaries() -> None:
    source = SCRIPT.read_text(encoding="utf-8")

    assert "ControlLeasePolicyTest" in source
    assert "TestControlCommandE2E" in source
    assert "go test -race ./internal/controltransport ./internal/controlstate ./internal/controlobs ./internal/deviceadapter" in source
    assert (
        "policy denials, routing, lease, duplicate, sequence, expiry, ACK, fail-safe, emergency-stop, leakage" in source
    )
