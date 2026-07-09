from __future__ import annotations

from pathlib import Path

import yaml

REPO_ROOT = Path(__file__).resolve().parents[2]
EVIDENCE_DOC = REPO_ROOT / "docs" / "operations" / "GCS-Saker_M7_release_cutover_evidence_2026-06-26.md"
RELEASE_NOTE = REPO_ROOT / "docs" / "releases" / "GCS-Saker_v0.7.1_M7_release_cutover_notes.md"
MATRIX = REPO_ROOT / "docs" / "architecture" / "GCS-Saker_v2_completion_matrix.yml"


def test_m7_release_cutover_evidence_records_server_gate_and_health_without_secrets() -> None:
    evidence = EVIDENCE_DOC.read_text(encoding="utf-8")

    assert "Server-01" in evidence
    assert "Server-02" in evidence
    assert "complete`: `true`" in evidence
    assert "failedRequired`: `[]`" in evidence
    assert "https://127.0.0.1/auth-policy/healthz`: `200`" in evidence
    assert "https://127.0.0.1/media-control/healthz`: `200`" in evidence
    assert "Secrets, raw credentials, private key paths" in evidence
    assert "#2258703325" not in evidence
    assert "AUTH_JWT_SECRET" not in evidence


def test_m7_release_cutover_note_links_completion_and_evidence_commands() -> None:
    release_note = RELEASE_NOTE.read_text(encoding="utf-8")

    assert "v0.7.1" in release_note
    assert "scripts/gates/m7_final_evidence_gate.py --run --timeout-seconds 120" in release_note
    assert "scripts/gates/v2_completion_gate.py --require-complete" in release_note
    assert "Server-01 final evidence gate: `complete=true`" in release_note
    assert "Server-02 final evidence gate: `complete=true`" in release_note


def test_v2_completion_matrix_promotes_release_gate_to_non_blocking() -> None:
    matrix = yaml.safe_load(MATRIX.read_text(encoding="utf-8"))
    release_gate = next(gate for gate in matrix["requiredGates"] if gate["issue"] == 423)

    assert matrix["releaseReadiness"] == "release-candidate"
    assert release_gate["currentState"] == "release-cutover-validated"
    assert release_gate["releaseBlocker"] is False
    assert str(EVIDENCE_DOC.relative_to(REPO_ROOT)) in release_gate["evidence"]
    assert str(RELEASE_NOTE.relative_to(REPO_ROOT)) in release_gate["evidence"]
