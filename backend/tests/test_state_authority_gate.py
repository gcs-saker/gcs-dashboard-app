import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def test_state_authority_contract_is_complete_and_enforced() -> None:
    result = subprocess.run(
        ["python", str(ROOT / "scripts/gates/state_authority_gate.py")],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    )

    assert result.stdout.strip() == "state authority contract passed for 5 stores"
