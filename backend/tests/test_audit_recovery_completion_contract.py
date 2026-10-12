from pathlib import Path

import yaml

REPO_ROOT = Path(__file__).resolve().parents[2]


def read_text(relative_path: str) -> str:
    return (REPO_ROOT / relative_path).read_text(encoding="utf-8")


def test_publish_session_lifecycle_is_a_cross_service_audit_contract() -> None:
    policy = yaml.safe_load(read_text("docs/compliance/security/audit-integrity-policy.yml"))
    kotlin_service = read_text(
        "services/auth-policy/src/main/kotlin/kr/co/a4ai/gcssaker/authpolicy/application/MediaLifecycleAuditService.kt"
    )
    go_sink = read_text("services/media-control/internal/authpolicy/lifecycle_audit.go")

    assert "publish-session-lifecycle" in policy["requiredEventFamilies"]
    for operation in ("publish.session.created", "publish.session.renewed", "publish.session.ended"):
        assert operation in kotlin_service
    assert "RecordPublishSessionLifecycle" in go_sink
    assert "sha256.Sum256" in go_sink


def test_required_reconciliation_is_part_of_recovery_evidence() -> None:
    profile = yaml.safe_load(read_text("docs/compliance/quality/recovery-qualification-profile.yml"))
    recovery_script = read_text("scripts/ops/recovery_qualification.py")

    assert "recordReconciliation" in profile["evidence"]["requiredFields"]
    reconciliation_scenarios = [
        scenario
        for scenario in profile["scenarios"]
        if "accepted-record-reconciliation" in scenario["recoveryEvidence"]
    ]
    assert {scenario["id"] for scenario in reconciliation_scenarios} == {"RQ-POSTGRES", "RQ-MQTT"}
    assert '"recordReconciliation": reconciliation' in recovery_script
    assert "reconciliation_passed" in recovery_script
