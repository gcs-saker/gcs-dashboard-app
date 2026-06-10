from pathlib import Path
import subprocess
import sys


REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPT = REPO_ROOT / "scripts" / "m7_regression_gate.sh"
DOC = REPO_ROOT / "docs" / "architecture" / "GCS-Saker_M7_regression_gate.md"


def test_m7_regression_gate_check_passes() -> None:
    result = subprocess.run(
        ["bash", str(SCRIPT), "--check"],
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    assert "M7 regression gate check passed" in result.stdout


def test_m7_regression_gate_documents_v020_and_poc_paths() -> None:
    content = DOC.read_text(encoding="utf-8")

    required_phrases = [
        "backend pytest + coverage",
        "backend mypy",
        "frontend test coverage",
        "Spring/Kotlin auth-policy",
        "Go media-control",
        "smoke: login -> dashboard -> stream list -> playback contract",
    ]

    for phrase in required_phrases:
        assert phrase in content


def test_m7_regression_gate_script_contains_full_commands() -> None:
    content = SCRIPT.read_text(encoding="utf-8")

    required_commands = [
        "pytest tests --cov=.",
        "mypy --config-file pyproject.toml .",
        "npm run test:coverage",
        "npm run build",
        "./gradlew check",
        "go test ./... -cover",
        "m7_single_node_runtime_smoke.sh",
        "m7_publish_play_smoke.sh",
        "m7_dashboard_first_frame_smoke.sh",
    ]

    for command in required_commands:
        assert command in content
