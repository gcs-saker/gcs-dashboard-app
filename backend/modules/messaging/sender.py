from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
import os
from typing import Protocol

from mqtt.client import MqttPayload, publish_control_command


class MessageSenderEnv:
    CONTROL_SENDER = "CONTROL_MESSAGE_SENDER"


class MessageSenderKind:
    MQTT = "mqtt"
    GRPC = "grpc"


class MessageContentType:
    TEXT = "text/plain"
    PROTOBUF = "application/x-protobuf"


class MessageSenderError(RuntimeError):
    pass


class MessageSenderUnavailable(MessageSenderError):
    pass


@dataclass(frozen=True)
class MessageEnvelope:
    destination: str
    payload: MqttPayload
    content_type: str


class MessageSender(Protocol):
    def send(self, envelope: MessageEnvelope) -> None:
        ...


class MqttMessageSender:
    def send(self, envelope: MessageEnvelope) -> None:
        publish_control_command(envelope.destination, envelope.payload)


class GrpcMessageSender:
    def send(self, envelope: MessageEnvelope) -> None:
        raise MessageSenderUnavailable("gRPC message sender is not implemented yet")


@lru_cache(maxsize=1)
def get_message_sender() -> MessageSender:
    sender_kind = os.getenv(MessageSenderEnv.CONTROL_SENDER, MessageSenderKind.MQTT).strip().lower()
    if sender_kind == MessageSenderKind.MQTT:
        return MqttMessageSender()
    if sender_kind == MessageSenderKind.GRPC:
        return GrpcMessageSender()
    raise MessageSenderUnavailable(f"unsupported control message sender: {sender_kind}")
