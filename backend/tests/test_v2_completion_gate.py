from __future__ import annotations

from pathlib import Path
import json
import subprocess
import sys

import yaml


REPO_ROOT = Path(__file__).resolve().parents[2]
MATRIX = REPO_ROOT / "docs" / "architecture" / "GCS-Saker_v2_completion_matrix.yml"
SCRIPT = REPO_ROOT / "scripts" / "v2_completion_gate.py"


def test_v2_completion_matrix_tracks_release_blockers_without_claiming_complete() -> None:
    matrix = yaml.safe_load(MATRIX.read_text(encoding="utf-8"))
    gates = matrix["requiredGates"]
    blockers = [gate for gate in gates if gate["releaseBlocker"]]

    assert matrix["schemaVersion"] == "gcs-saker-v2-completion-matrix-v1"
    assert matrix["releaseReadiness"] == "alpha-core"
    assert "production-ready complete가 아니다" in matrix["decision"]
    assert matrix["trackerIssue"] == 411
    assert matrix["releaseGateIssue"] == 423
    assert len(gates) >= 10
    assert len(blockers) >= 4
    assert 472 in {gate["issue"] for gate in gates}
    assert 472 not in {gate["issue"] for gate in blockers}
    assert 423 in {gate["issue"] for gate in blockers}


def test_v2_completion_gate_reports_current_readiness_json() -> None:
    result = subprocess.run(
        [sys.executable, str(SCRIPT), "--json"],
        check=False,
        capture_output=True,
        text=True,
        cwd=REPO_ROOT,
    )

    assert result.returncode == 0, result.stderr
    payload = json.loads(result.stdout)
    assert payload["schemaVersion"] == "gcs-saker-v2-completion-matrix-v1"
    assert payload["releaseReadiness"] == "alpha-core"
    assert payload["complete"] is False
    assert payload["releaseBlockers"] >= 4
    assert 423 in payload["blockingIssues"]


def test_v2_completion_gate_can_fail_release_cutover_when_blockers_remain() -> None:
    result = subprocess.run(
        [sys.executable, str(SCRIPT), "--require-complete"],
        check=False,
        capture_output=True,
        text=True,
        cwd=REPO_ROOT,
    )

    assert result.returncode == 1
    assert "blockers" in result.stdout
