from pathlib import Path

import pytest

from api.contracts import ControlProtocol
from model.control_model import ControlCommand
from modules.messaging.control_publisher import ControlMessagePublisher, get_control_message_publisher
from modules.messaging.sender import (
    GrpcMessageSender,
    MessageEnvelope,
    MessageContentType,
    MessageSenderEnv,
    MessageSenderKind,
    MessageSenderUnavailable,
    grpc_metadata,
    grpc_timeout_seconds,
    get_message_sender,
)


REPO_ROOT = Path(__file__).resolve().parents[2]
CONTROL_API = REPO_ROOT / "backend" / "api" / "control.py"


class RecordingSender:
    def __init__(self) -> None:
        self.sent: list[MessageEnvelope] = []

    def send(self, envelope: MessageEnvelope) -> None:
        self.sent.append(envelope)


class RecordingGrpcTransport:
    def __init__(self) -> None:
        self.sent: list[bytes] = []

    def send(self, payload: bytes) -> None:
        self.sent.append(payload)


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
    monkeypatch.delenv(MessageSenderEnv.GRPC_TARGET, raising=False)
    clear_sender_caches()

    with pytest.raises(MessageSenderUnavailable, match="gRPC gateway target is not configured"):
        get_message_sender()

    clear_sender_caches()


def test_grpc_message_sender_sends_only_protobuf_payload() -> None:
    transport = RecordingGrpcTransport()
    sender = GrpcMessageSender(transport)
    payload = b"\x0a\x04test"

    sender.send(
        MessageEnvelope(
            destination="gcs/a4ai/co-a/CID001/command",
            payload=payload,
            content_type=MessageContentType.PROTOBUF,
        )
    )

    assert transport.sent == [payload]


def test_grpc_message_sender_rejects_text_payload() -> None:
    sender = GrpcMessageSender(RecordingGrpcTransport())

    with pytest.raises(MessageSenderUnavailable, match="requires protobuf payload"):
        sender.send(
            MessageEnvelope(
                destination="robot/control/CID001",
                payload="stop",
                content_type=MessageContentType.TEXT,
            )
        )


def test_grpc_metadata_keeps_auth_out_of_payload() -> None:
    metadata = grpc_metadata("gateway-token")

    assert metadata == (
        ("authorization", "Bearer gateway-token"),
        ("x-gcs-gateway-token", "gateway-token"),
    )


def test_grpc_metadata_is_empty_when_token_is_not_configured() -> None:
    assert grpc_metadata("") is None


def test_grpc_timeout_uses_safe_default_for_invalid_values() -> None:
    assert grpc_timeout_seconds("") == 2.0
    assert grpc_timeout_seconds("-1") == 2.0
    assert grpc_timeout_seconds("0") == 2.0
    assert grpc_timeout_seconds("3.5") == 3.5


def test_message_sender_factory_rejects_unknown_sender(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv(MessageSenderEnv.CONTROL_SENDER, "raw-socket")
    clear_sender_caches()

    with pytest.raises(MessageSenderUnavailable, match="unsupported control message sender"):
        get_message_sender()

    clear_sender_caches()
