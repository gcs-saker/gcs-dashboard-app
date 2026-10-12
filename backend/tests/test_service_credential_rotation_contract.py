from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[2]
COMPOSE = ROOT / "deploy" / "compose" / "compose.single-node.poc.yml"
RUNBOOK = ROOT / "docs" / "operations" / "GCS-Saker_Service_Credential_Rotation_Runbook.md"


def test_compose_exposes_validation_only_rotation_secrets() -> None:
    services = yaml.safe_load(COMPOSE.read_text(encoding="utf-8"))["services"]
    auth_policy = services["auth-policy"]["environment"]

    assert auth_policy["GCS_INTERNAL_GRPC_PREVIOUS_TOKEN"] == "${AUTH_POLICY_RPC_PREVIOUS_TOKEN:-}"
    assert auth_policy["AUTH_POLICY_AUDIT_INGEST_PREVIOUS_TOKEN"] == ("${AUTH_POLICY_AUDIT_INGEST_PREVIOUS_TOKEN:-}")


def test_rotation_runbook_preserves_independent_credentials_and_mobile_boundary() -> None:
    runbook = RUNBOOK.read_text(encoding="utf-8")

    for credential in (
        "MEDIA_CONTROL_PUBLISH_TOKEN",
        "MEDIA_CONTROL_GRPC_TOKEN",
        "AUTH_POLICY_RPC_TOKEN",
        "AUTH_POLICY_AUDIT_INGEST_TOKEN",
        "TURN_SHARED_SECRET",
    ):
        assert credential in runbook
    assert "previous 값은 검증 전용" in runbook
    assert "모바일 코드, 모바일 이미지" in runbook
    assert "실제 credential 원문은 증거에" in runbook
