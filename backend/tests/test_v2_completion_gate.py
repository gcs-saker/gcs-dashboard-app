from __future__ import annotations

from pathlib import Path
import json
import subprocess
import sys

import yaml


REPO_ROOT = Path(__file__).resolve().parents[2]
MATRIX = REPO_ROOT / "docs" / "architecture" / "GCS-Saker_v2_completion_matrix.yml"
SCRIPT = REPO_ROOT / "scripts" / "gates" / "v2_completion_gate.py"


def test_v2_completion_matrix_tracks_release_cutover_without_blockers() -> None:
    matrix = yaml.safe_load(MATRIX.read_text(encoding="utf-8"))
    gates = matrix["requiredGates"]
    blockers = [gate for gate in gates if gate["releaseBlocker"]]

    assert matrix["schemaVersion"] == "gcs-saker-v2-completion-matrix-v1"
    assert matrix["releaseReadiness"] == "release-candidate"
    assert "release cutover gate는 통과" in matrix["decision"]
    assert matrix["trackerIssue"] == 411
    assert matrix["releaseGateIssue"] == 423
    assert len(gates) >= 10
    assert len(blockers) == 0
    assert 472 in {gate["issue"] for gate in gates}
    assert 472 not in {gate["issue"] for gate in blockers}
    assert 421 not in {gate["issue"] for gate in blockers}
    assert 423 not in {gate["issue"] for gate in blockers}


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
    assert payload["releaseReadiness"] == "release-candidate"
    assert payload["complete"] is True
    assert payload["releaseBlockers"] == 0
    assert payload["blockingIssues"] == []


def test_v2_completion_gate_accepts_release_cutover_when_no_blockers_remain() -> None:
    result = subprocess.run(
        [sys.executable, str(SCRIPT), "--require-complete"],
        check=False,
        capture_output=True,
        text=True,
        cwd=REPO_ROOT,
    )

    assert result.returncode == 0
    assert "0 blockers" in result.stdout
