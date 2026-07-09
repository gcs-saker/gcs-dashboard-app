from __future__ import annotations

import importlib.util
import json
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPT = REPO_ROOT / "scripts" / "gates" / "m10_runtime_evidence_gate.py"


def load_gate_module():
    spec = importlib.util.spec_from_file_location("m10_runtime_evidence_gate", SCRIPT)
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def test_m10_runtime_evidence_gate_check_exposes_live_nat_and_db_metrics() -> None:
    result = subprocess.run(
        [sys.executable, str(SCRIPT), "--check"],
        check=False,
        capture_output=True,
        text=True,
        cwd=REPO_ROOT,
    )

    assert result.returncode == 0, result.stderr
    payload = json.loads(result.stdout)
    assert payload["schemaVersion"] == "m10-runtime-evidence-gate-v1"
    assert "WHEP answer latency ms" in payload["externalNatRequiredMetrics"]
    assert "First video frame latency ms" in payload["externalNatRequiredMetrics"]
    assert "Audio/video sync offset ms" in payload["externalNatRequiredMetrics"]
    assert "explain.sharedHitBlocks" in payload["dbRuntimeRequiredMetrics"]
    assert "explain.walRecords" in payload["dbRuntimeRequiredMetrics"]
    command_names = {command["name"] for command in payload["commands"]}
    assert {
        "external_nat_contract",
        "performance_schema",
        "postgis_runtime_contract",
        "postgis_runtime_run",
    } <= command_names


def test_m10_runtime_evidence_gate_validates_external_nat_report(tmp_path: Path) -> None:
    module = load_gate_module()
    report = tmp_path / "external-nat-report.txt"
    report.write_text(
        "\n".join(
            [
                "WHEP answer latency ms: 276.5",
                "First video frame latency ms: 922.2",
                "Audio/video sync offset ms: 37.4",
                "Selected ICE pair: local=srflx, remote=host, protocol=udp, rtt_ms=12.5",
                "ICE path: direct",
                "Relay fallback reason: none",
                "External NAT smoke wall latency ms: 1402",
            ]
        ),
        encoding="utf-8",
    )

    validation = module.validate_external_nat_report(report)

    assert validation["passed"] is True
    assert validation["metrics"]["whepAnswerLatencyMs"] == 276.5
    assert validation["metrics"]["firstVideoFrameLatencyMs"] == 922.2
    assert validation["metrics"]["audioVideoSyncOffsetMs"] == 37.4
    assert validation["metrics"]["icePath"] == "direct"


def test_m10_runtime_evidence_gate_rejects_missing_external_nat_metrics(tmp_path: Path) -> None:
    module = load_gate_module()
    report = tmp_path / "external-nat-report.txt"
    report.write_text("WHEP answer latency ms: 100.0\n", encoding="utf-8")

    validation = module.validate_external_nat_report(report)

    assert validation["passed"] is False
    assert "Audio/video sync offset ms" in validation["missingMetrics"]


def test_m10_runtime_evidence_gate_validates_postgis_runtime_summary() -> None:
    module = load_gate_module()
    validation = module.validate_postgis_runtime(
        {
            "passed": True,
            "postgisVersion": "3.4",
            "historyRowsForSmoke": 2,
            "explain": {
                "executionTimeMs": 0.12,
                "sharedHitBlocks": 3,
                "sharedReadBlocks": 0,
                "sharedDirtiedBlocks": 0,
                "sharedWrittenBlocks": 0,
                "walRecords": 0,
                "walBytes": 0,
            },
        }
    )

    assert validation["passed"] is True
    assert validation["metrics"]["explain"]["walRecords"] == 0
