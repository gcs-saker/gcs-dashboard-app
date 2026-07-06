import subprocess
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]


def test_m7_publish_play_smoke_contract_check_passes():
    result = subprocess.run(
        ["bash", str(REPO_ROOT / "scripts" / "smoke" / "m7_publish_play_smoke.sh"), "--check"],
        cwd=REPO_ROOT,
        check=True,
        text=True,
        capture_output=True,
    )

    assert "M7 publish/play smoke check passed" in result.stdout
