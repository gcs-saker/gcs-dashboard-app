from pathlib import Path

import pytest

from api.contracts import ControlProtocol
from model.control_model import ControlCommand
from modules.messaging.control_publisher import ControlMessagePublisher, get_control_message_publisher
from modules.messaging.sender import (
    MessageEnvelope,
    MessageSenderEnv,
    MessageSenderKind,
    MessageSenderUnavailable,
    get_message_sender,
)


REPO_ROOT = Path(__file__).resolve().parents[2]
CONTROL_API = REPO_ROOT / "backend" / "api" / "control.py"


class RecordingSender:
    def __init__(self) -> None:
        self.sent: list[MessageEnvelope] = []

    def send(self, envelope: MessageEnvelope) -> None:
        self.sent.append(envelope)


def clear_sender_caches() -> None:
    get_message_sender.cache_clear()
    get_control_message_publisher.cache_clear()


def test_control_api_does_not_import_mqtt_transport_directly() -> None:
    source = CONTROL_API.read_text(encoding="utf-8")

    assert "mqtt.client" not in source
    assert "publish_control_command" not in source
    assert "get_control_message_publisher" in source


def test_control_publisher_uses_sender_interface_for_legacy_payload() -> None:
    sender = RecordingSender()
    publisher = ControlMessagePublisher(sender)

    result = publisher.publish(ControlCommand(cid="CID001", direction="stop"))

    assert result.destination == f"{ControlProtocol.TOPIC_PREFIX}/CID001"
    assert len(sender.sent) == 1
    assert sender.sent[0].destination == f"{ControlProtocol.TOPIC_PREFIX}/CID001"
    assert sender.sent[0].payload == "stop"


def test_control_publisher_uses_sender_interface_for_protobuf_payload() -> None:
    sender = RecordingSender()
    publisher = ControlMessagePublisher(sender)

    result = publisher.publish(
        ControlCommand(
            cid="CID001",
            direction="stop",
            payload_format=ControlProtocol.PROTOBUF_PAYLOAD_FORMAT,
            org_id="a4ai",
            group_id="co-a",
            stream_id="raw.mobile.front",
        )
    )

    assert result.destination == "gcs/a4ai/co-a/CID001/command"
    assert len(sender.sent) == 1
    assert sender.sent[0].destination == "gcs/a4ai/co-a/CID001/command"
    assert isinstance(sender.sent[0].payload, bytes)


def test_message_sender_factory_keeps_mqtt_as_default(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv(MessageSenderEnv.CONTROL_SENDER, raising=False)
    clear_sender_caches()

    sender = get_message_sender()

    assert sender.__class__.__name__ == "MqttMessageSender"
    clear_sender_caches()


def test_message_sender_factory_can_select_grpc_profile(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv(MessageSenderEnv.CONTROL_SENDER, MessageSenderKind.GRPC)
    clear_sender_caches()

    sender = get_message_sender()

    with pytest.raises(MessageSenderUnavailable, match="gRPC message sender is not implemented yet"):
        sender.send(MessageEnvelope(destination="gcs/a4ai/co-a/CID001/command", payload=b"", content_type="x"))

    clear_sender_caches()


def test_message_sender_factory_rejects_unknown_sender(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv(MessageSenderEnv.CONTROL_SENDER, "raw-socket")
    clear_sender_caches()

    with pytest.raises(MessageSenderUnavailable, match="unsupported control message sender"):
        get_message_sender()

    clear_sender_caches()
