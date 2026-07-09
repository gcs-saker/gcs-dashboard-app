from __future__ import annotations

import importlib.util
import json
import subprocess
import sys
from pathlib import Path
from types import ModuleType

REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPT = REPO_ROOT / "scripts" / "benchmarks" / "telemetry_bulk_flush_benchmark.py"
DOC = REPO_ROOT / "docs" / "architecture" / "GCS-Saker_telemetry_storage_bulk_write_contract.md"


def load_benchmark_module() -> ModuleType:
    spec = importlib.util.spec_from_file_location("telemetry_bulk_flush_benchmark", SCRIPT)
    assert spec is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules["telemetry_bulk_flush_benchmark"] = module
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def test_telemetry_bulk_flush_benchmark_check_reports_stable_metrics() -> None:
    result = subprocess.run(
        [sys.executable, str(SCRIPT), "--check"],
        check=False,
        capture_output=True,
        text=True,
        cwd=REPO_ROOT,
    )

    assert result.returncode == 0, result.stderr
    payload = json.loads(result.stdout)
    assert payload["schemaVersion"] == "telemetry-bulk-flush-benchmark-v1"
    assert payload["mode"] == "synthetic-compile-only"
    assert "ingestThroughputRecordsPerSec" in payload["metrics"]
    assert "flushLatencyMs" in payload["metrics"]
    assert "postgresAvoidedStatementCount" in payload["metrics"]
    assert "live DB" in "\n".join(payload["notes"])


def test_telemetry_bulk_flush_benchmark_runs_small_batch_without_database() -> None:
    result = subprocess.run(
        [sys.executable, str(SCRIPT), "--records", "20", "--batch-size", "5"],
        check=False,
        capture_output=True,
        text=True,
        cwd=REPO_ROOT,
    )

    assert result.returncode == 0, result.stderr
    payload = json.loads(result.stdout)
    summary = payload["summary"]
    assert payload["schemaVersion"] == "telemetry-bulk-flush-benchmark-v1"
    assert summary["records"] == 20
    assert summary["batchSize"] == 5
    assert summary["postgresStatementCount"] == 8
    assert summary["mysqlStatementCount"] == 4
    assert summary["flushLatencyMs"] >= 0
    assert summary["ingestThroughputRecordsPerSec"] > 0


def test_telemetry_bulk_flush_benchmark_module_reports_statement_reduction() -> None:
    module = load_benchmark_module()

    result = module.run_benchmark(records=20, batch_size=5)
    payload = result.to_dict()

    assert payload["records"] == 20
    assert payload["postgresStatementCount"] == 8
    assert payload["mysqlStatementCount"] == 4
    assert payload["postgresAvoidedStatementCount"] == 12
    assert payload["mysqlAvoidedStatementCount"] == 16


def test_telemetry_bulk_write_contract_documents_failure_policy_and_synthetic_scope() -> None:
    content = DOC.read_text(encoding="utf-8")

    for phrase in [
        "PostgreSQL profile은 latest 1회와 history 1회",
        "MySQL/MariaDB profile은 1회 statement",
        "DB bulk flush 장애",
        "queue 앞쪽에 복원",
        "실제 DB capacity claim은 운영 DB에서 별도 측정",
        "PostgreSQL avoided statements",
        "MySQL avoided statements",
    ]:
        assert phrase in content
