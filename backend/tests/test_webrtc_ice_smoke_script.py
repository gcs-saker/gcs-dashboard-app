from pathlib import Path
import importlib.util
import subprocess
import sys


REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPT = REPO_ROOT / "scripts" / "webrtc_ice_smoke.py"
DOC = REPO_ROOT / "docs" / "m1" / "streaming-e2e-smoke-test.md"


def load_smoke_module():
    spec = importlib.util.spec_from_file_location("webrtc_ice_smoke", SCRIPT)
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def test_webrtc_ice_smoke_script_check_mode_passes_without_aiortc() -> None:
    result = subprocess.run(
        [str(SCRIPT), "--check"],
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    assert "WebRTC ICE smoke check passed" in result.stdout
    assert "stun:localhost:3478" in result.stdout
    assert "Sample candidate summary:" in result.stdout


def test_webrtc_ice_smoke_parser_requires_answer_ice_data() -> None:
    module = load_smoke_module()
    sample_answer = "\r\n".join(
        [
            "v=0",
            "o=- 0 0 IN IP4 127.0.0.1",
            "s=-",
            "t=0 0",
            "a=ice-ufrag:answerUfrag",
            "a=ice-pwd:answerPassword",
            "a=fingerprint:sha-256 AA:BB:CC",
            "m=video 9 UDP/TLS/RTP/SAVPF 96",
            "a=candidate:1 1 udp 2130706431 127.0.0.1 8189 typ host",
        ]
    )

    inspection = module.require_webrtc_sdp(sample_answer, "WHEP answer")

    assert inspection.has_ice_ufrag is True
    assert inspection.has_ice_pwd is True
    assert inspection.has_fingerprint is True
    assert inspection.candidate_count == 1
    assert inspection.candidates.host == 1
    assert inspection.candidates.srflx == 0
    assert inspection.candidates.relay == 0
    assert inspection.candidates.private_or_loopback == 1
    assert inspection.candidates.public_or_dns == 0
    assert inspection.has_video_media is True


def test_webrtc_ice_smoke_candidate_summary_counts_public_and_private_candidates() -> None:
    module = load_smoke_module()
    sample_answer = "\r\n".join(
        [
            "a=candidate:1 1 udp 2130706431 127.0.0.1 8189 typ host",
            "a=candidate:2 1 udp 2130706431 172.23.0.4 8189 typ host",
            "a=candidate:3 1 udp 2130706431 121.159.26.245 8189 typ host",
            "a=candidate:4 1 udp 1694498815 121.159.26.245 49170 typ srflx raddr 10.0.0.2 rport 49170",
            "a=candidate:5 1 udp 16777215 121.159.26.245 49180 typ relay raddr 0.0.0.0 rport 0",
        ]
    )

    summary = module.inspect_sdp(sample_answer).candidates

    assert summary.total == 5
    assert summary.host == 3
    assert summary.srflx == 1
    assert summary.relay == 1
    assert summary.private_or_loopback == 2
    assert summary.public_or_dns == 3


def test_webrtc_ice_smoke_script_documents_live_whep_ice_run() -> None:
    script = SCRIPT.read_text(encoding="utf-8")
    doc = DOC.read_text(encoding="utf-8")

    assert "RTCPeerConnection" in script
    assert "RTCIceServer" in script
    assert "wait_for_ice_gathering_complete" in script
    assert "candidate summary" in script
    assert "--require-connected" in script
    assert "WHEP offer/answer" in doc
    assert "ICE candidate" in doc
    assert "stun:localhost:3478" in doc
