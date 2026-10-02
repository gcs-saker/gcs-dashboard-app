import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts/gates/security_hardening_gate.py"


def test_security_hardening_gate_covers_all_seven_areas() -> None:
    result = subprocess.run(
        ["python", str(SCRIPT), "--check"],
        cwd=ROOT,
        check=True,
        text=True,
        capture_output=True,
    )

    assert result.stdout.strip() == "security hardening contract passed for 7 controls"
