import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts" / "reports" / "final_e2e_qualification.py"


def test_final_e2e_qualification_is_scoped_and_does_not_overstate_field_execution() -> None:
    result = subprocess.run([sys.executable, str(SCRIPT), "--check"], capture_output=True, text=True, check=False)
    payload = json.loads(result.stdout)

    assert result.returncode == 0
    assert payload["localDocker"] == "PASS"
    assert payload["server01"] == "NOT_RUN"
    assert payload["physicalEquipment"] == "BLOCKED"
    assert payload["virtualDeviceCounts"] == [10, 50, 100]
    assert payload["missingEvidence"] == []
    assert "plaintext-private-transport" in payload["negativeControls"]
