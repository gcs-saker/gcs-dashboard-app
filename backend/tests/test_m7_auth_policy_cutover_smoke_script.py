import subprocess
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]


def test_m7_auth_policy_cutover_smoke_contract_check_passes():
    result = subprocess.run(
        ["bash", str(REPO_ROOT / "scripts" / "smoke" / "m7_auth_policy_cutover_smoke.sh"), "--check"],
        cwd=REPO_ROOT,
        check=True,
        text=True,
        capture_output=True,
    )

    assert "M7 auth-policy cutover smoke check passed" in result.stdout


def test_m7_auth_policy_cutover_smoke_exercises_required_auth_endpoints():
    script = (REPO_ROOT / "scripts" / "smoke" / "m7_auth_policy_cutover_smoke.sh").read_text(encoding="utf-8")

    assert "${auth_base}/signup" in script
    assert "${auth_base}/login" in script
    assert "${auth_base}/me" in script
    assert "${auth_base}/refresh" in script
    assert "${auth_base}/logout" in script
    assert "Origin: ${EDGE_BASE_URL}" in script
    assert "Verified: signup, login, me, refresh rotation, logout" in script
