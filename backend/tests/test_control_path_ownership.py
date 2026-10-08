from pathlib import Path

from fastapi.testclient import TestClient

from main import app

REPO_ROOT = Path(__file__).resolve().parents[2]


def test_python_backend_no_longer_exposes_or_implements_control_transport() -> None:
    with TestClient(app) as client:
        response = client.post("/control/", json={"cid": "device-01", "direction": "stop"})

    assert response.status_code == 404
    assert not (REPO_ROOT / "backend" / "api" / "control.py").exists()
    assert not (REPO_ROOT / "backend" / "modules" / "messaging" / "control_publisher.py").exists()
    assert not (REPO_ROOT / "backend" / "modules" / "messaging" / "sender.py").exists()
    assert not (REPO_ROOT / "backend" / "mqtt" / "client.py").exists()


def test_runtime_configuration_has_no_python_control_sender_or_legacy_command_acl() -> None:
    paths = (
        REPO_ROOT / "backend" / ".env.example",
        REPO_ROOT / "deploy" / "compose" / "compose.single-node.poc.yml",
        REPO_ROOT / "gcs-dashboard" / "docker-compose.yml",
    )
    runtime = "\n".join(path.read_text(encoding="utf-8") for path in paths)
    acl = (REPO_ROOT / "deploy" / "mosquitto" / "acl.hardened").read_text(encoding="utf-8")

    assert "CONTROL_MESSAGE_SENDER" not in runtime
    assert "topic write gcs/+/+/+/command" not in acl
    assert "pattern read gcs/+/+/%u/command" not in acl
    assert "topic write gcs/device/+/+/command" in acl
