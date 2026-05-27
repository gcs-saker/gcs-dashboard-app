from pathlib import Path
import re

import yaml


REPO_ROOT = Path(__file__).resolve().parents[2]
MEDIAMTX_CONFIG = REPO_ROOT / "gcs-dashboard" / "mediamtx.yml"
DOCKER_COMPOSE = REPO_ROOT / "gcs-dashboard" / "docker-compose.yml"
DOCKER_ICE_COMPOSE = REPO_ROOT / "gcs-dashboard" / "docker-compose.ice.example.yml"
DOCKER_ENV_EXAMPLE = REPO_ROOT / "gcs-dashboard" / ".env.example"
ICE_DOC = REPO_ROOT / "docs" / "m1" / "mediamtx-ice-servers.md"


PORT_MAPPING_PATTERN = re.compile(r"(?P<published>.+):(?P<target>\d+)(?:/(?P<protocol>tcp|udp))?$")


def load_yaml(path: Path) -> dict:
    with path.open("r", encoding="utf-8") as file:
        return yaml.safe_load(file)


def mediamtx_service_ports() -> list[str]:
    compose = load_yaml(DOCKER_COMPOSE)
    return compose["services"]["mediamtx"].get("ports", [])


def port_targets(ports: list[str]) -> set[tuple[str, str]]:
    targets = set()
    for port in ports:
        match = PORT_MAPPING_PATTERN.search(port)
        if match:
            targets.add((match.group("target"), match.group("protocol") or "tcp"))
    return targets


def mediamtx_port(address: str) -> str:
    return address.rsplit(":", maxsplit=1)[-1]


def test_mediamtx_enables_webrtc_whep_and_keeps_hls_fallback():
    config = load_yaml(MEDIAMTX_CONFIG)

    assert config["webrtc"] is True
    assert config["webrtcAddress"] == ":8889"
    assert config["webrtcAllowOrigin"] == "*"
    assert "webrtcAllowOrigins" not in config
    assert config["webrtcLocalUDPAddress"] == ":8189"
    assert config["webrtcLocalTCPAddress"] == ":8189"
    assert config["hls"] is True
    assert config["hlsAddress"] == ":8888"
    assert config["hlsAllowOrigin"] == "*"
    assert "hlsAllowOrigins" not in config


def test_compose_pins_mediamtx_runtime_version_for_config_compatibility():
    compose = load_yaml(DOCKER_COMPOSE)
    image = compose["services"]["mediamtx"]["image"]

    assert image == "${MEDIAMTX_IMAGE:-bluenviron/mediamtx:1.15.3}"
    assert ":latest" not in image


def test_mediamtx_declares_ingest_ports_for_rtsp_rtmp_and_srt():
    config = load_yaml(MEDIAMTX_CONFIG)

    assert config["rtsp"] is True
    assert config["rtspAddress"] == ":8554"
    assert config["rtpAddress"] == ":8000"
    assert config["rtcpAddress"] == ":8001"
    assert config["rtmp"] is True
    assert config["rtmpAddress"] == ":1935"
    assert config["srt"] is True
    assert config["srtAddress"] == ":8890"


def test_compose_exposes_mediamtx_playback_and_ingest_ports():
    targets = port_targets(mediamtx_service_ports())

    assert ("8889", "tcp") in targets
    assert ("8189", "udp") in targets
    assert ("8189", "tcp") in targets
    assert ("8888", "tcp") in targets
    assert ("8554", "tcp") in targets
    assert ("8890", "udp") in targets
    assert ("1935", "tcp") in targets


def test_compose_ports_match_mediamtx_listener_addresses():
    config = load_yaml(MEDIAMTX_CONFIG)
    targets = port_targets(mediamtx_service_ports())

    assert (mediamtx_port(config["webrtcAddress"]), "tcp") in targets
    assert (mediamtx_port(config["webrtcLocalUDPAddress"]), "udp") in targets
    assert (mediamtx_port(config["webrtcLocalTCPAddress"]), "tcp") in targets
    assert (mediamtx_port(config["hlsAddress"]), "tcp") in targets
    assert (mediamtx_port(config["rtspAddress"]), "tcp") in targets
    assert (mediamtx_port(config["srtAddress"]), "udp") in targets
    assert (mediamtx_port(config["rtmpAddress"]), "tcp") in targets


def test_mediamtx_keeps_api_and_metrics_private_by_default():
    config = load_yaml(MEDIAMTX_CONFIG)
    exposed_ports = mediamtx_service_ports()

    assert config["api"] is False
    assert config["apiAddress"] == "127.0.0.1:9997"
    assert config["metrics"] is False
    assert config["metricsAddress"] == "127.0.0.1:9998"
    assert not any("9997" in port for port in exposed_ports)
    assert not any("9998" in port for port in exposed_ports)


def test_compose_port_overrides_are_documented_without_management_ports():
    env_example = DOCKER_ENV_EXAMPLE.read_text(encoding="utf-8")

    assert "MEDIAMTX_WEBRTC_SIGNALING_PORT=8889" in env_example
    assert "MEDIAMTX_WEBRTC_ICE_UDP_PORT=8189" in env_example
    assert "MEDIAMTX_WEBRTC_ICE_TCP_PORT=8189" in env_example
    assert "MEDIAMTX_HLS_PORT=8888" in env_example
    assert "MEDIAMTX_RTSP_PORT=8554" in env_example
    assert "MEDIAMTX_SRT_PORT=8890" in env_example
    assert "MEDIAMTX_RTMP_PORT=1935" in env_example
    assert "9997" not in env_example
    assert "9998" not in env_example


def test_mediamtx_declares_empty_ice_server_slot_for_env_override():
    config = load_yaml(MEDIAMTX_CONFIG)

    assert config["webrtcICEServers2"] == []
    assert config["webrtcSTUNGatherTimeout"] == "5s"


def test_ice_compose_override_maps_stun_env_to_mediamtx_config():
    override = load_yaml(DOCKER_ICE_COMPOSE)
    environment = override["services"]["mediamtx"]["environment"]

    assert environment["MTX_WEBRTCICESERVERS2_0_URL"] == "${MEDIAMTX_STUN_URL:?Set MEDIAMTX_STUN_URL in .env}"
    assert not any("9997" in key or "9998" in key for key in environment)
    assert not any("PASSWORD" in key for key in environment)


def test_env_example_documents_ice_server_values_without_real_turn_secret():
    env_example = DOCKER_ENV_EXAMPLE.read_text(encoding="utf-8")

    assert "MEDIAMTX_STUN_URL=" in env_example
    assert "MEDIAMTX_TURN_URL=" in env_example
    assert "MEDIAMTX_TURN_USERNAME=AUTH_SECRET" in env_example
    assert "MEDIAMTX_TURN_PASSWORD=replace-with-secret-outside-git" in env_example
    assert "Do not commit real TURN credentials" in env_example


def test_ice_server_documentation_explains_nat_and_webrtc_encryption_boundary():
    doc = ICE_DOC.read_text(encoding="utf-8")

    assert "NAT traversal" in doc
    assert "DTLS/SRTP" in doc
    assert "STUN은 암호화를 담당하지 않는다" in doc
    assert "TURN credential은 저장소에 들어가지 않는다" in doc


def test_mediamtx_accepts_publisher_for_all_stream_paths():
    config = load_yaml(MEDIAMTX_CONFIG)

    assert config["paths"]["all"]["source"] == "publisher"
