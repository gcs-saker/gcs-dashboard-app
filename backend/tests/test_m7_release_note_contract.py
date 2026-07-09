from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
RELEASE_NOTE = REPO_ROOT / "docs" / "releases" / "GCS-Saker_v0.7.0_M7_release_notes.md"
RELEASE_README = REPO_ROOT / "docs" / "releases" / "README.md"


def test_m7_release_note_records_completion_evidence() -> None:
    doc = RELEASE_NOTE.read_text(encoding="utf-8")

    for required_term in [
        "v0.7.0",
        "#229",
        "#231",
        "#233",
        "#275",
        "#277",
        "Spring/Kotlin auth-policy",
        "Go media-control",
        "MediaMTX",
        "coturn",
        "Python backend: `254 passed`, coverage `96%`",
        "Frontend: `142 passed`",
        "npm audit",
        "pip_audit",
        "403 Forbidden",
        "Rollback 기준",
        "Known Issues",
    ]:
        assert required_term in doc


def test_release_readme_knows_m7_version_and_note_path() -> None:
    doc = RELEASE_README.read_text(encoding="utf-8")

    assert "`v0.7.0` | M7" in doc
    assert "GCS-Saker_v0.7.0_M7_release_notes.md" in doc
    assert "active runtime path" in doc
