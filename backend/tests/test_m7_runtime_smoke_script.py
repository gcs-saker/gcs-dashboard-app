import subprocess
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]


def test_m7_runtime_smoke_contract_check_passes():
    result = subprocess.run(
        ["bash", str(REPO_ROOT / "scripts" / "m7_single_node_runtime_smoke.sh"), "--check"],
        cwd=REPO_ROOT,
        check=True,
        text=True,
        capture_output=True,
    )

    assert "M7 single-node runtime smoke check passed" in result.stdout


def test_m7_runtime_smoke_ports_override_public_playback_urls():
    script = (REPO_ROOT / "scripts" / "m7_single_node_runtime_smoke.sh").read_text(encoding="utf-8")

    assert "MEDIAMTX_PUBLIC_WEBRTC_BASE_URL" in script
    assert "MEDIAMTX_PUBLIC_HLS_BASE_URL" in script
    assert "MEDIA_CONTROL_PUBLIC_WEBRTC_BASE_URL" in script
    assert "MEDIA_CONTROL_PUBLIC_HLS_BASE_URL" in script
    assert "VITE_STREAM_API_BASE_URL" in script
    assert "VITE_LOCAL_WEBCAM_WHIP_URL" in script
    assert "BACKEND_CORS_ALLOW_ORIGINS" in script
    assert "WEBRTC_STUN_URL" in script
    assert "WEBRTC_TURN_URL" in script
    assert "VITE_WEBRTC_STUN_URL" in script
    assert "http://127.0.0.1:${PUBLIC_HTTP_PORT}/webrtc" in script
    assert "http://127.0.0.1:${PUBLIC_HTTP_PORT}/hls" in script
    assert "/media-control" in script
    assert "stun:127.0.0.1:${TURN_PRIMARY_HOST_PORT}" in script
    assert "turn:127.0.0.1:${TURN_PRIMARY_HOST_PORT}?transport=udp" in script
    assert "http://127.0.0.1:${PUBLIC_HTTP_PORT},http://localhost:${PUBLIC_HTTP_PORT}" in script


def test_m7_runtime_smoke_requires_backend_stream_status_payload():
    script = (REPO_ROOT / "scripts" / "m7_single_node_runtime_smoke.sh").read_text(encoding="utf-8")

    assert "wait_for_stream_status" in script
    assert '"stream":"ready"' in script
    assert "compose restart edge" in script
