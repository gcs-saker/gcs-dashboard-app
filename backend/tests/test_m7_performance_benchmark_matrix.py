import json
import subprocess
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPT = REPO_ROOT / "scripts" / "m7_performance_benchmark_matrix.py"
DOC = REPO_ROOT / "docs" / "architecture" / "GCS-Saker_M7_performance_benchmark_matrix.md"


def test_m7_performance_benchmark_check_prints_stable_schema() -> None:
    result = subprocess.run(
        [sys.executable, str(SCRIPT), "--check"],
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    payload = json.loads(result.stdout)
    assert payload["schemaVersion"] == "m7-performance-benchmark-v1"
    assert payload["profileLabels"] == ["legacy", "v0.2.0", "m7"]
    for metric in [
        "auth_login",
        "auth_refresh",
        "stream_list",
        "stream_playback",
        "stream_ice_servers",
        "hls_manifest",
    ]:
        assert metric in payload["requiredMetrics"]


def test_m7_performance_benchmark_document_explains_comparison_contract() -> None:
    content = DOC.read_text(encoding="utf-8")

    required_phrases = [
        "old legacy",
        "release v0.2.0",
        "M7 언어 변경 완성본",
        "p50",
        "p95",
        "whep_answer_latency_ms",
        "first_video_frame_latency_ms",
        "passwordEnv",
    ]
    for phrase in required_phrases:
        assert phrase in content


def test_m7_performance_benchmark_script_uses_password_env_not_literal_secret() -> None:
    content = SCRIPT.read_text(encoding="utf-8")

    assert "passwordEnv" in content
    assert "M7_BENCHMARK_PASSWORD" not in content
    assert "schemaVersion" in content
