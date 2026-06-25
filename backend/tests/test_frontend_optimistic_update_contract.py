from __future__ import annotations

from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
FRONTEND_SRC = REPO_ROOT / "gcs-dashboard" / "src"
AUDIT_DOC = REPO_ROOT / "docs" / "architecture" / "GCS-Saker_frontend_optimistic_update_audit.md"

FORBIDDEN_SERVER_OPTIMISTIC_PATTERNS = (
    "onMutate",
    "setQueryData",
    "useMutation",
    "rollback",
)

LOCAL_FIRST_FILES = (
    "gcs-dashboard/src/features/dashboard/hooks/useDashboardUserPreferences.ts",
    "gcs-dashboard/src/features/dashboard/userPreferencesStore.ts",
    "gcs-dashboard/src/features/dashboard/streamPreferences.ts",
)


def iter_frontend_sources() -> list[Path]:
    return sorted(
        path
        for path in FRONTEND_SRC.rglob("*")
        if path.suffix in {".ts", ".tsx"} and not path.name.endswith(".test.ts") and not path.name.endswith(".test.tsx")
    )


def test_frontend_does_not_use_unguarded_server_optimistic_mutations() -> None:
    hits: list[str] = []
    for path in iter_frontend_sources():
        text = path.read_text(encoding="utf-8")
        for pattern in FORBIDDEN_SERVER_OPTIMISTIC_PATTERNS:
            if pattern in text:
                hits.append(f"{path.relative_to(REPO_ROOT)}:{pattern}")

    assert hits == []


def test_manual_stream_address_is_not_marked_online_before_server_or_playback_validation() -> None:
    source = (FRONTEND_SRC / "features" / "dashboard" / "streamDevices.ts").read_text(encoding="utf-8")
    manual_factory = source.split("export function createManualStreamDeviceOption", 1)[1].split(
        "export function normalizeStreamAddress",
        1,
    )[0]

    assert 'status: "degraded"' in manual_factory
    assert 'status: "online"' not in manual_factory


def test_optimistic_update_audit_documents_local_first_boundaries() -> None:
    audit = AUDIT_DOC.read_text(encoding="utf-8")

    assert "서버 성공을 미리 가정하는 optimistic update" in audit
    assert "직접 스트림 주소 연결" in audit
    assert "서버 검증 전 `online`" in audit
    assert "TanStack Query mutation" in audit
    for relative_path in LOCAL_FIRST_FILES:
        assert relative_path in audit
