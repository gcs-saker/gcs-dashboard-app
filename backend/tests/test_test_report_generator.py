from __future__ import annotations

from pathlib import Path
import json
import subprocess
import sys


REPO_ROOT = Path(__file__).resolve().parents[2]
REPORT_SCRIPT = REPO_ROOT / "scripts" / "generate_test_report.py"


def test_test_report_generator_contract_lists_full_check_commands() -> None:
    result = subprocess.run(
        [sys.executable, str(REPORT_SCRIPT), "--check"],
        check=False,
        capture_output=True,
        text=True,
        cwd=REPO_ROOT,
    )

    assert result.returncode == 0, result.stderr
    payload = json.loads(result.stdout)
    assert payload["schemaVersion"] == "gcs-saker-test-report-v1"
    assert payload["intentReport"] == "per-intent pass/fail cards"
    assert {
        "Architecture Intent Gate",
        "Backend Pytest",
        "Frontend Vitest",
        "Frontend Build",
        "Go Media Control",
        "Spring Auth Policy",
        "M7 Regression Gate",
        "Docker Compose Default",
        "Docker Compose Geo Profile",
        "DragonFly Profile Smoke",
        "gRPC Descriptor Smoke",
    } <= set(payload["commands"])
