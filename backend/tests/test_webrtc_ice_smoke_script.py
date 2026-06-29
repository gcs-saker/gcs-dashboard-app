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
    assert "stun:stun.l.google.com:19302" in result.stdout
    assert "Sample candidate summary:" in result.stdout
    assert "Selected ICE pair:" in result.stdout
    assert "ICE path summary contract:" in result.stdout
    assert "Audio/video sync contract:" in result.stdout
    assert "direct_ratio=0.5000" in result.stdout


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


def test_webrtc_ice_smoke_extracts_direct_selected_pair_from_stats() -> None:
    module = load_smoke_module()
    stats = {
        "transport": {
            "id": "transport",
            "type": "transport",
            "selectedCandidatePairId": "pair-1",
        },
        "pair-1": {
            "id": "pair-1",
            "type": "candidate-pair",
            "localCandidateId": "local-1",
            "remoteCandidateId": "remote-1",
            "currentRoundTripTime": 0.0123,
            "state": "succeeded",
        },
        "local-1": {
            "id": "local-1",
            "type": "local-candidate",
            "candidateType": "srflx",
            "protocol": "udp",
        },
        "remote-1": {
            "id": "remote-1",
            "type": "remote-candidate",
            "candidateType": "host",
            "protocol": "udp",
        },
    }

    selected_pair = module.extract_selected_ice_pair(stats)

    assert selected_pair is not None
    assert selected_pair.local_candidate_type == "srflx"
    assert selected_pair.remote_candidate_type == "host"
    assert selected_pair.protocol == "udp"
    assert selected_pair.rtt_ms == 12.3
    assert selected_pair.path == "direct"
    assert selected_pair.relay_fallback_reason is None


def test_webrtc_ice_smoke_classifies_relay_and_fallback_reason() -> None:
    module = load_smoke_module()
    local_offer = module.inspect_sdp(
        "\r\n".join(
            [
                "a=ice-ufrag:offer",
                "a=ice-pwd:offer-pwd",
                "a=fingerprint:sha-256 AA",
                "m=video 9 UDP/TLS/RTP/SAVPF 96",
                "a=candidate:1 1 udp 2130706431 10.0.0.2 8189 typ host",
            ]
        )
    )
    answer = module.inspect_sdp(
        "\r\n".join(
            [
                "a=ice-ufrag:answer",
                "a=ice-pwd:answer-pwd",
                "a=fingerprint:sha-256 BB",
                "m=video 9 UDP/TLS/RTP/SAVPF 96",
                "a=candidate:2 1 udp 16777215 121.159.26.245 49180 typ relay raddr 0.0.0.0 rport 0",
            ]
        )
    )
    selected_pair = module.SelectedIcePair(
        local_candidate_type="host",
        remote_candidate_type="relay",
        protocol="udp",
        rtt_ms=42.0,
        path=module.classify_ice_path("host", "relay"),
        relay_fallback_reason=None,
    )

    reason = module.infer_relay_fallback_reason(selected_pair, local_offer, answer)
    summary = module.summarize_ice_paths([selected_pair])

    assert selected_pair.path == "relay"
    assert reason == "remote_selected_relay_candidate"
    assert summary.total == 1
    assert summary.direct == 0
    assert summary.relay == 1
    assert summary.relay_ratio == 1.0


def test_webrtc_ice_smoke_script_documents_live_whep_ice_run() -> None:
    script = SCRIPT.read_text(encoding="utf-8")
    doc = DOC.read_text(encoding="utf-8")

    assert "RTCPeerConnection" in script
    assert "RTCIceServer" in script
    assert "wait_for_ice_gathering_complete" in script
    assert "candidate summary" in script
    assert "Selected ICE pair" in script
    assert "relay_fallback_reason" in script
    assert "--require-connected" in script
    assert "--measure-audio-video-sync" in script
    assert "Audio/video sync offset ms" in script
    assert "WHEP offer/answer" in doc
    assert "ICE candidate" in doc
    assert "stun:stun.l.google.com:19302" in doc
