import subprocess
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]


def test_m7_publish_play_smoke_contract_check_passes():
    result = subprocess.run(
        ["bash", str(REPO_ROOT / "scripts" / "smoke" / "m7_publish_play_smoke.sh"), "--check"],
        cwd=REPO_ROOT,
        check=True,
        text=True,
        capture_output=True,
    )

    assert "M7 publish/play smoke check passed" in result.stdout


def test_m7_publish_play_uses_server_issued_media_routes():
    script = (REPO_ROOT / "scripts" / "smoke" / "m7_publish_play_smoke.sh").read_text(encoding="utf-8")

    assert "/media-control/api/v1/account/publish-sessions" in script
    assert "/media-control/api/v1/streams/${stream_id}/playback" in script
    assert "webrtc_whip_publish_smoke.py" in script
    assert "--publish-token-file" in script
    assert "--require-video-frame" in script
    assert "--require-audio-frame" in script
    assert "PLAYBACK_RETRY_COUNT" in script
    assert '[[ "$status" == "404" || "$status" == "409" ]]' in script
    assert "Waiting for stream registry" in script
    assert 'docker run -d --name "$PUBLISHER_NAME"' in script
    assert 'docker run -d --rm --name "$PUBLISHER_NAME"' not in script
    assert 'docker logs --tail 80 "$PUBLISHER_NAME"' in script
    assert "Authenticated WHIP publisher failed; retained tail follows" in script
    assert "rtsp://mediamtx" not in script
    assert "STREAM_PATH=" not in script
