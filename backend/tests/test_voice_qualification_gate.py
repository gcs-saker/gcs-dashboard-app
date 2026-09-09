import runpy
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
GATE = ROOT / "scripts/gates/voice_qualification_gate.py"


def test_voice_software_evidence_passes_without_overstating_physical_result() -> None:
    module = runpy.run_path(str(GATE))

    assert module["validate"]() == 7
    results = module["load_results"]()
    assert results["overallStatus"] == "BLOCKED"
    assert results["humanIntelligibility"]["status"] == "BLOCKED"
