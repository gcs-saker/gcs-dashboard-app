from pathlib import Path
import subprocess


REPO_ROOT = Path(__file__).resolve().parents[2]
FINAL_CLEANUP_DOC = REPO_ROOT / "docs" / "operations" / "GCS-Saker_M7_final_cleanup_runbook_v0.1.md"

FORBIDDEN_TRACKED_PATHS = {
    "gcs-dashboard/.env",
    "backend/의존성 충돌해결",
    "gcs-dashboard/gcs-dashboard@0.1.0",
    "gcs-dashboard/npm",
    "gcs-dashboard/react-scripts",
}


def git_ls_files() -> set[str]:
    result = subprocess.run(
        ["git", "ls-files"],
        cwd=REPO_ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    return set(result.stdout.splitlines())


def test_m7_final_cleanup_keeps_local_env_and_scratch_files_untracked() -> None:
    tracked_paths = git_ls_files()

    assert tracked_paths.isdisjoint(FORBIDDEN_TRACKED_PATHS)


def test_m7_final_cleanup_runbook_records_remaining_final_gate_items() -> None:
    doc = FINAL_CLEANUP_DOC.read_text(encoding="utf-8")

    for required_term in [
        "#275",
        "npm audit",
        "gcs-dashboard/.env",
        "Server-02",
        "dubious ownership",
        "legacy/deprecated",
        "degraded behavior",
    ]:
        assert required_term in doc
