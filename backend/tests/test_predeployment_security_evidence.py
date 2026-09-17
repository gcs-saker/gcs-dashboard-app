from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
EVIDENCE = REPO_ROOT / "docs/compliance/evidence/predeployment-security-qualification-2026-09-17.md"


def test_predeployment_evidence_preserves_blocked_external_qualification() -> None:
    evidence = EVIDENCE.read_text(encoding="utf-8")

    assert "Production deployment: `NOT_RUN`" in evidence
    assert "2. License evidence | BLOCKED" in evidence
    assert "5. Internal service trust boundary | BLOCKED" in evidence
    assert "6. Audit and clock integrity | BLOCKED" in evidence
    assert "8. Voice qualification | BLOCKED" in evidence
    assert "physical mobile" in evidence


def test_predeployment_evidence_records_the_recovery_defect_and_mitigation() -> None:
    evidence = EVIDENCE.read_text(encoding="utf-8")

    assert "MediaMTX v1.15.3 rejected v1.21 CORS keys" in evidence
    assert "candidate-config preflight" in evidence
    assert "Redis, PostgreSQL, stack readiness, and MediaMTX API recovery passed" in evidence


def test_predeployment_evidence_binds_source_and_signed_release() -> None:
    evidence = EVIDENCE.read_text(encoding="utf-8")

    assert "6c38de371fd223eef2d097f1e8993fec21e2cd5d" in evidence
    assert "b1bda30214fc59bd2e5a86a2b9ba4275ed83cff7" in evidence
    assert "35182450271" in evidence
