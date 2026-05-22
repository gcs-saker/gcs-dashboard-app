from pathlib import Path
import os
import subprocess


REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPT = REPO_ROOT / "scripts" / "publish_sample_stream.sh"
DOC = REPO_ROOT / "docs" / "m1" / "sample-stream-publish.md"


def run_script(*args: str, env: dict[str, str] | None = None) -> subprocess.CompletedProcess[str]:
    merged_env = os.environ.copy()
    if env:
        merged_env.update(env)

    return subprocess.run(
        ["bash", str(SCRIPT), *args],
        check=False,
        capture_output=True,
        text=True,
        env=merged_env,
    )


def test_sample_stream_publish_script_exists_and_uses_bash_strict_mode():
    script = SCRIPT.read_text(encoding="utf-8")

    assert script.startswith("#!/usr/bin/env bash")
    assert "set -euo pipefail" in script


def test_sample_stream_publish_script_has_valid_bash_syntax():
    result = subprocess.run(["bash", "-n", str(SCRIPT)], check=False, capture_output=True, text=True)

    assert result.returncode == 0, result.stderr


def test_sample_stream_dry_run_targets_m1_raw_sample_front_path():
    result = run_script("--dry-run")

    assert result.returncode == 0
    assert "rtsp://127.0.0.1:8554/raw/sample/front" in result.stdout
    assert "testsrc2=size=1280x720:rate=30" in result.stdout
    assert "-rtsp_transport tcp" in result.stdout
    assert "libx264" in result.stdout


def test_sample_stream_dry_run_uses_port_override_without_changing_path():
    result = run_script("--dry-run", env={"MEDIAMTX_RTSP_PORT": "18554"})

    assert result.returncode == 0
    assert "rtsp://127.0.0.1:18554/raw/sample/front" in result.stdout


def test_sample_stream_documentation_matches_script_contract():
    doc = DOC.read_text(encoding="utf-8")

    assert "scripts/publish_sample_stream.sh" in doc
    assert "raw/sample/front" in doc
    assert "raw.sample.front" in doc
    assert "rtsp://127.0.0.1:8554/raw/sample/front" in doc
    assert "docker compose up mediamtx" in doc
    assert "Connection refused" in doc
