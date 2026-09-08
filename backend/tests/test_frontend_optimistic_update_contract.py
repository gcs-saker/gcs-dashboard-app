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
    "gcs-dashboard/src/features/dashboard/hooks/controller/useDashboardUserPreferences.ts",
    "gcs-dashboard/src/features/dashboard/preferences/userPreferencesStore.ts",
    "gcs-dashboard/src/features/dashboard/preferences/streamPreferences.ts",
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


def test_manual_stream_address_connection_is_not_exposed() -> None:
    source = (FRONTEND_SRC / "features" / "dashboard" / "assets" / "streamDevices.ts").read_text(encoding="utf-8")
    assert "createManualStreamDeviceOption" not in source
    assert "normalizeStreamAddress" not in source


def test_optimistic_update_audit_documents_local_first_boundaries() -> None:
    audit = AUDIT_DOC.read_text(encoding="utf-8")

    assert "서버 성공을 미리 가정하는 optimistic update" in audit
    assert "직접 스트림 주소 연결 제거" in audit
    assert "registry stream ID" in audit
    assert "TanStack Query mutation" in audit
    for relative_path in LOCAL_FIRST_FILES:
        assert relative_path in audit
