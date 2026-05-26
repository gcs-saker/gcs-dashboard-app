from pathlib import Path
import subprocess


REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPT = REPO_ROOT / "scripts" / "server_baseline_check.sh"
CHECKLIST = REPO_ROOT / "docs" / "operations" / "GCS-Saker_서버기준선_점검표_v0.1.md"
TEMPLATE = REPO_ROOT / "docs" / "operations" / "GCS-Saker_서버기준선_점검결과_TEMPLATE.md"


def test_server_baseline_check_script_exists_and_uses_strict_mode():
    script = SCRIPT.read_text(encoding="utf-8")

    assert script.startswith("#!/usr/bin/env bash")
    assert "set -euo pipefail" in script


def test_server_baseline_check_script_has_valid_bash_syntax():
    result = subprocess.run(["bash", "-n", str(SCRIPT)], check=False, capture_output=True, text=True)

    assert result.returncode == 0, result.stderr


def test_server_baseline_check_contract_is_available():
    result = subprocess.run(
        ["bash", str(SCRIPT), "--check"],
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    assert "Server baseline check contract passed" in result.stdout
    assert "os docker disk memory cpu network processes" in result.stdout


def test_server_baseline_checklist_covers_m2_01_acceptance_items():
    checklist = CHECKLIST.read_text(encoding="utf-8")

    for required in [
        "OS 버전",
        "Docker",
        "Disk",
        "Memory",
        "CPU",
        "Static IP",
        "Existing Saker process",
        "Ready",
        "Blocked",
    ]:
        assert required in checklist


def test_server_baseline_result_template_keeps_server_01_and_02_separate():
    template = TEMPLATE.read_text(encoding="utf-8")

    assert "Server-01" in template
    assert "Server-02" in template
    assert "M2-02 백업 진입 판단" in template
