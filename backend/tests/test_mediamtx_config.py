from pathlib import Path

import yaml


REPO_ROOT = Path(__file__).resolve().parents[2]
MEDIAMTX_CONFIG = REPO_ROOT / "gcs-dashboard" / "mediamtx.yml"
DOCKER_COMPOSE = REPO_ROOT / "gcs-dashboard" / "docker-compose.yml"


def load_yaml(path: Path) -> dict:
    with path.open("r", encoding="utf-8") as file:
        return yaml.safe_load(file)


def test_mediamtx_enables_webrtc_whep_and_keeps_hls_fallback():
    config = load_yaml(MEDIAMTX_CONFIG)

    assert config["webrtc"] is True
    assert config["webrtcAddress"] == ":8889"
    assert config["webrtcLocalUDPAddress"] == ":8189"
    assert config["webrtcLocalTCPAddress"] == ":8189"
    assert config["hls"] is True
    assert config["hlsAddress"] == ":8888"


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


def test_mediamtx_keeps_api_and_metrics_private_by_default():
    config = load_yaml(MEDIAMTX_CONFIG)
    compose = load_yaml(DOCKER_COMPOSE)
    exposed_ports = compose["services"]["mediamtx"].get("ports", [])

    assert config["api"] is False
    assert config["apiAddress"] == "127.0.0.1:9997"
    assert config["metrics"] is False
    assert config["metricsAddress"] == "127.0.0.1:9998"
    assert not any("9997" in port for port in exposed_ports)
    assert not any("9998" in port for port in exposed_ports)


def test_mediamtx_accepts_publisher_for_all_stream_paths():
    config = load_yaml(MEDIAMTX_CONFIG)

    assert config["paths"]["all"]["source"] == "publisher"
