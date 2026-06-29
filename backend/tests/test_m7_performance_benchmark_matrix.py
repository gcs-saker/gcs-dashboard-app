import json
import importlib.util
import subprocess
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPT = REPO_ROOT / "scripts" / "m7_performance_benchmark_matrix.py"
DOC = REPO_ROOT / "docs" / "architecture" / "GCS-Saker_M7_performance_benchmark_matrix.md"


def load_benchmark_module():
    spec = importlib.util.spec_from_file_location("m7_performance_benchmark_matrix", SCRIPT)
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


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
    assert payload["iceProfileLabels"] == ["stun-direct", "turn-relay"]
    for metric in [
        "auth_login",
        "auth_refresh",
        "ops_event_metrics",
        "ops_event_graphql_page",
        "stream_list",
        "stream_playback",
        "stream_ice_servers",
        "hls_manifest",
    ]:
        assert metric in payload["requiredMetrics"]
    for metric in [
        "whep_answer_latency_ms",
        "first_video_frame_latency_ms",
        "first_audio_frame_latency_ms",
        "audio_video_sync_offset_ms",
    ]:
        assert metric in payload["mediaSmokeMetrics"]
    for metric in [
        "selected_local_candidate_type",
        "selected_remote_candidate_type",
        "selected_ice_protocol",
        "ice_rtt_ms",
        "direct_ratio",
        "relay_ratio",
        "relay_fallback_reason",
    ]:
        assert metric in payload["icePathMetrics"]


def test_m7_performance_benchmark_build_check_report_exposes_ice_path_contract() -> None:
    module = load_benchmark_module()

    payload = module.build_check_report()

    assert payload["schemaVersion"] == "m7-performance-benchmark-v1"
    assert payload["icePathMetrics"] == [
        "selected_local_candidate_type",
        "selected_remote_candidate_type",
        "selected_ice_protocol",
        "ice_rtt_ms",
        "direct_ratio",
        "relay_ratio",
        "relay_fallback_reason",
    ]


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
        "first_audio_frame_latency_ms",
        "audio_video_sync_offset_ms",
        "selected_local_candidate_type",
        "relay_fallback_reason",
        "stun-direct",
        "turn-relay",
        "ops_event_metrics",
        "ops_event_graphql_page",
        "--insecure",
        "passwordEnv",
    ]
    for phrase in required_phrases:
        assert phrase in content


def test_m7_performance_benchmark_script_uses_password_env_not_literal_secret() -> None:
    content = SCRIPT.read_text(encoding="utf-8")

    assert "passwordEnv" in content
    assert "M7_BENCHMARK_PASSWORD" not in content
    assert "schemaVersion" in content
    assert "--insecure" in content
    assert "iceProfileLabels" in content
