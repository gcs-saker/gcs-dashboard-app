from __future__ import annotations

from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
RUNTIME_CONTRACT_FILES = (
    REPO_ROOT / "backend" / "main.py",
    REPO_ROOT / "backend" / ".env.example",
    REPO_ROOT / "deploy" / "compose" / ".env.single-node.example",
    REPO_ROOT / "deploy" / "compose" / ".env.closed-network.example",
    REPO_ROOT / "deploy" / "compose" / "compose.single-node.poc.yml",
    REPO_ROOT / "gcs-dashboard" / "docker-compose.yml",
)


def test_python_runtime_has_no_legacy_mqtt_telemetry_subscriber() -> None:
    main = (REPO_ROOT / "backend" / "main.py").read_text(encoding="utf-8")

    assert not (REPO_ROOT / "backend" / "mqtt" / "subscriber.py").exists()
    assert not (REPO_ROOT / "backend" / "mqtt" / "consumer_bridge.py").exists()
    assert "mqtt.subscriber" not in main
    assert "MQTT_V2_TELEMETRY_SUBSCRIBER_ENABLED" not in repository_runtime_text()


def test_group_bearing_telemetry_topics_are_absent_from_runtime_configuration() -> None:
    acl = (REPO_ROOT / "deploy" / "mosquitto" / "acl.hardened").read_text(encoding="utf-8")

    assert "gcs/+/+/+/telemetry" not in acl
    assert "pattern write gcs/+/+/%u/telemetry" not in acl
    assert "topic read gcs/device/+/+/telemetry" in acl
    assert "pattern write gcs/device/%u/+/telemetry" in acl


def repository_runtime_text() -> str:
    return "\n".join(path.read_text(encoding="utf-8") for path in RUNTIME_CONTRACT_FILES)
