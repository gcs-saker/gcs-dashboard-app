from pathlib import Path
import subprocess


REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPT = REPO_ROOT / "scripts" / "smoke" / "streaming_e2e_smoke.sh"
DOC = REPO_ROOT / "docs" / "m1" / "streaming-e2e-smoke-test.md"


def test_streaming_e2e_smoke_script_exists_and_uses_strict_bash_mode():
    script = SCRIPT.read_text(encoding="utf-8")

    assert script.startswith("#!/usr/bin/env bash")
    assert "set -euo pipefail" in script


def test_streaming_e2e_smoke_script_has_valid_bash_syntax():
    result = subprocess.run(["bash", "-n", str(SCRIPT)], check=False, capture_output=True, text=True)

    assert result.returncode == 0, result.stderr


def test_streaming_e2e_smoke_check_validates_documented_contract():
    result = subprocess.run(
        ["bash", str(SCRIPT), "--check"],
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    assert "Streaming E2E smoke check passed" in result.stdout
    assert "rtsp://127.0.0.1:8554/raw/sample/front" in result.stdout
    assert "WebRTC ICE smoke check passed" in result.stdout


def test_streaming_e2e_documentation_covers_webrtc_hls_and_ice_paths():
    doc = DOC.read_text(encoding="utf-8")

    assert "raw.sample.front" in doc
    assert "raw/sample/front" in doc
    assert "streamingSmoke=1" in doc
    assert "WebRTC" in doc
    assert "HLS fallback" in doc
    assert "STUN" in doc
    assert "WHEP offer/answer" in doc
    assert "ICE candidate" in doc
    assert "TURN credential" in doc
