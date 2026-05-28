import json
from pathlib import Path
import subprocess
import sys


REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPT = REPO_ROOT / "scripts" / "streaming_core_perf_check.py"


def test_streaming_core_perf_script_reports_core_endpoint_latency():
    result = subprocess.run(
        [
            sys.executable,
            str(SCRIPT),
            "--iterations",
            "3",
            "--warmup",
            "1",
            "--json",
        ],
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    report = json.loads(result.stdout)
    assert report["target"] == "streaming-core-v0.1.0-local-fastapi-testclient"

    results = {item["name"]: item for item in report["results"]}
    assert set(results) == {
        "auth_login_api",
        "auth_refresh_api",
        "stream_list_api",
        "stream_ice_servers_api",
        "stream_playback_api",
        "mock_ai_detection_api",
    }
    assert all(item["errors"] == 0 for item in results.values())
    assert all(item["iterations"] == 3 for item in results.values())
    assert all(item["p95_ms"] >= item["p50_ms"] for item in results.values())
