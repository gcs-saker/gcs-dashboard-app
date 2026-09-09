import runpy
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
GATE = ROOT / "scripts/gates/delivery_readiness_gate.py"


def test_delivery_gate_blocks_release_without_overstating_evidence() -> None:
    module = runpy.run_path(str(GATE))
    counts = module["validate"]()
    readiness = module["load_readiness"]()

    assert counts == {"PASS": 1, "FAIL": 0, "BLOCKED": 3, "NOT_RUN": 2}
    assert readiness["overallStatus"] == "BLOCKED"
    assert readiness["releaseTagAllowed"] is False
