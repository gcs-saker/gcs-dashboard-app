import subprocess
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]


def test_m7_runtime_smoke_contract_check_passes():
    result = subprocess.run(
        ["bash", str(REPO_ROOT / "scripts" / "m7_single_node_runtime_smoke.sh"), "--check"],
        cwd=REPO_ROOT,
        check=True,
        text=True,
        capture_output=True,
    )

    assert "M7 single-node runtime smoke check passed" in result.stdout
