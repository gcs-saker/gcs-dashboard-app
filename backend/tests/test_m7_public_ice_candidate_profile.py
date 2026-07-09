from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
PUBLIC_ICE_ENV = REPO_ROOT / "deploy" / "compose" / ".env.public-ice.example"
PUBLIC_ICE_DOC = REPO_ROOT / "docs" / "operations" / "GCS-Saker_M7_public_ice_candidate_운영가이드.md"


def test_public_ice_env_example_keeps_direct_first_contract_without_secrets() -> None:
    content = PUBLIC_ICE_ENV.read_text(encoding="utf-8")

    required_lines = [
        "MEDIAMTX_ICE_BIND_ADDR=0.0.0.0",
        "MEDIAMTX_WEBRTC_IPS_FROM_INTERFACES=false",
        "MEDIAMTX_WEBRTC_ADDITIONAL_HOSTS=a4ai.tplinkdns.com",
        "MEDIA_CONTROL_STUN_URL=stun:a4ai.tplinkdns.com:3478",
        "MEDIA_CONTROL_TURN_MAX_HEALTHY_SERVERS=1",
    ]
    for line in required_lines:
        assert line in content
    assert "PASSWORD=" not in content
    assert "SECRET=" not in content


def test_public_ice_operation_guide_documents_stun_first_and_turn_fallback() -> None:
    content = PUBLIC_ICE_DOC.read_text(encoding="utf-8")

    required_phrases = [
        "direct STUN",
        "TURN relay",
        "MEDIAMTX_WEBRTC_ADDITIONAL_HOSTS",
        "relay=0",
        "turn relay smoke",
    ]
    for phrase in required_phrases:
        assert phrase in content
