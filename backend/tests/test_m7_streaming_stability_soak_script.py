import subprocess
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPT = REPO_ROOT / "scripts" / "smoke" / "m7_streaming_stability_soak.sh"
DOC = REPO_ROOT / "docs" / "operations" / "GCS-Saker_M7_streaming_stability_soak.md"


def test_m7_streaming_stability_soak_check_passes() -> None:
    result = subprocess.run(
        ["bash", str(SCRIPT), "--check"],
        cwd=REPO_ROOT,
        check=True,
        text=True,
        capture_output=True,
    )

    assert "M7 streaming stability soak check passed" in result.stdout


def test_m7_streaming_stability_soak_documents_duration_and_recovery_metrics() -> None:
    script = SCRIPT.read_text(encoding="utf-8")
    doc = DOC.read_text(encoding="utf-8")

    assert "SOAK_DURATION_SECONDS" in script
    assert "SOAK_SAMPLE_INTERVAL_SECONDS" in script
    assert "SOAK_DURATION_SECONDS=1800" in doc
    assert "SOAK_DURATION_SECONDS=3600" in doc
    assert "disconnect events" in script
    assert "reconnect successes" in script
    assert "fallback events" in script
    assert "disconnect/fallback event" in doc


def test_m7_streaming_stability_soak_collects_server_and_ice_metrics() -> None:
    script = SCRIPT.read_text(encoding="utf-8")
    doc = DOC.read_text(encoding="utf-8")

    assert 'stats --no-stream' in script
    assert "SERVER_SSH_TARGET" in script
    assert "SERVER_DOCKER_COMMAND" in script
    assert "TURN primary" in script
    assert "TURN secondary" in script
    assert "--require-video-frame" in script
    assert "candidate summary" in doc
    assert "Docker CPU/memory/network snapshot" in doc
