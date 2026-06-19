from __future__ import annotations

from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
AUDIT = REPO_ROOT / "docs" / "architecture" / "GCS-Saker_stack_synergy_audit.md"

ACTIVE_STACK_TERMS = (
    "Nginx edge",
    "React/Vite dashboard",
    "TanStack Query",
    "Spring/Kotlin auth-policy",
    "Go media-control",
    "MediaMTX",
    "coturn primary/secondary",
    "Redis",
    "MySQL legacy",
    "Python backend legacy/fallback",
    "Docker Compose",
)

NON_ACTIVE_STACK_TERMS = (
    "MQTT broker",
    "Protobuf",
    "gRPC bidirectional streaming",
    "DragonFly",
    "PostgreSQL/PostGIS",
    "GraphQL",
    "WebCodecs + Canvas",
    "HTTP/3",
    "AI sidecar",
)


def test_stack_synergy_audit_covers_active_and_non_active_runtime_stacks() -> None:
    text = AUDIT.read_text(encoding="utf-8")

    for term in ACTIVE_STACK_TERMS:
        assert term in text
    for term in NON_ACTIVE_STACK_TERMS:
        assert term in text


def test_stack_synergy_audit_rejects_claiming_contract_stacks_as_complete() -> None:
    text = AUDIT.read_text(encoding="utf-8")

    assert "gRPC는 장점을 살렸다고 말할 수 없다" in text
    assert "DragonFly는 Redis 대체 가능성을 검토한 수준" in text
    assert "PostGIS는 geo profile이 있을 뿐" in text
    assert "WebCodecs는 recording/AI overlay/HLS fallback 후보" in text


def test_stack_synergy_audit_documents_cross_stack_compensation() -> None:
    text = AUDIT.read_text(encoding="utf-8")

    assert "Media path와 control path 분리" in text
    assert "인증/정책과 stream control 분리" in text
    assert "Redis와 MySQL 역할 분리" in text
    assert "Nginx edge와 internal networks" in text
    assert "Local-first UI와 server state 분리" in text
