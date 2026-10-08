import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
EVIDENCE = ROOT / "docs/compliance/evidence/telemetry-load-qualification-2026-10-08.json"
SUMMARY = ROOT / "docs/compliance/evidence/telemetry-load-qualification-2026-10-08.md"
REPORT = ROOT / "scripts/reports/telemetry_load_qualification.py"
LOAD_TEST = ROOT / "services/media-control/internal/mqttgateway/load_qualification_test.go"


def test_load_qualification_harness_uses_production_queue_boundaries() -> None:
    source = LOAD_TEST.read_text(encoding="utf-8")

    assert "ingressQueueCapacity" in source
    assert "consumer{" in source
    assert "enqueueMessage(" in source
    assert "10, 50, 100" in source
    assert "TestTelemetryIngressLoadQualification" in source


def test_load_qualification_evidence_and_summary_are_current() -> None:
    result = subprocess.run(
        [sys.executable, str(REPORT), "--input", str(EVIDENCE), "--output", str(SUMMARY), "--check"],
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    assert json.loads(result.stdout) == {"result": "PASS", "scenarios": [10, 50, 100]}
    summary = SUMMARY.read_text(encoding="utf-8")
    assert "PASS (가상 인프로세스 부하)" in summary
    assert "NOT_RUN" in summary
