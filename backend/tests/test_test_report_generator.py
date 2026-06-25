from __future__ import annotations

import importlib.util
from pathlib import Path
import json
import subprocess
import sys


REPO_ROOT = Path(__file__).resolve().parents[2]
REPORT_SCRIPT = REPO_ROOT / "scripts" / "generate_test_report.py"
PRINCIPLE_MATRIX = REPO_ROOT / "docs" / "architecture" / "GCS-Saker_principle_proof_matrix.yml"
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
    assert payload["principleReport"] == "project principles expected-vs-observed proof tables"
    assert {
        "Architecture Intent Gate",
        "Saker v2 Completion Gate",
        "Backend Pytest",
        "Frontend Vitest",
        "Frontend Build",
        "Go Media Control",
        "Spring Auth Policy",
        "M7 Regression Gate",
        "Docker Compose Default",
        "Docker Compose PostGIS Runtime",
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


def test_test_report_renders_project_principle_proof_tables() -> None:
    report_generator = load_report_generator()

    principle_rows = report_generator.evaluate_principles()
    html = report_generator.render_html([], [], principle_rows)

    assert len(principle_rows) >= 20
    assert "Project Principles Proof" in html
    assert "자동 검증이 어려운 운영 항목은 수동 검증 필요로 남겨 거짓 완료를 막습니다." in html
    assert "media frame은 MQTT에 태우지 않는다" in html
    assert "STUN 우선, TURN fallback" in html
    assert "검증 방식" in html
    assert "실제 관측값" in html
    assert all(row["details"] for row in principle_rows)
    assert all(row["passed"] for row in principle_rows)


def test_principle_proof_matrix_covers_requested_principle_groups() -> None:
    import yaml

    matrix = yaml.safe_load(PRINCIPLE_MATRIX.read_text(encoding="utf-8"))
    groups = {principle["group"] for principle in matrix["principles"]}

    assert matrix["schemaVersion"] == "gcs-saker-principle-proof-matrix-v1"
    assert {
        "project-management",
        "security",
        "closed-network",
        "code-design",
        "system-architecture",
        "stack-migration",
        "streaming-low-latency",
        "operations",
        "cross-cutting",
    } <= groups
