from __future__ import annotations

import importlib.util
from pathlib import Path
import json
import subprocess
import sys


REPO_ROOT = Path(__file__).resolve().parents[2]
REPORT_SCRIPT = REPO_ROOT / "scripts" / "generate_test_report.py"
sys.path.insert(0, str(REPO_ROOT / "scripts"))


def load_report_generator():
    spec = importlib.util.spec_from_file_location("generate_test_report", REPORT_SCRIPT)
    assert spec is not None
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    sys.modules["generate_test_report"] = module
    spec.loader.exec_module(module)
    return module


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
    assert payload["intentReport"] == "per-intent expected-vs-observed evidence tables"
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


def test_test_report_renders_design_intent_evidence_tables() -> None:
    report_generator = load_report_generator()

    intent_rows = report_generator.evaluate_intents()
    html = report_generator.render_html([], intent_rows)

    assert "검증 방식" in html
    assert "기대값" in html
    assert "실제 관측값" in html
    assert "근거" in html
    assert "결과" in html
    assert "active runtime은 기본 compose에서 바로 떠야 한다" in html
    assert "auth-policy" in html
    assert "exists=True, profiles=None" in html
    assert all(row["details"] for row in intent_rows)
