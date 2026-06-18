from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache

from api.contracts import ControlProtocol
from model.control_model import ControlCommand
from mqtt.topics import command_topic
from modules.messaging.sender import MessageContentType, MessageEnvelope, MessageSender, get_message_sender
from modules.protocol_v2.stream_control import StreamCommandPayload


@dataclass(frozen=True)
class ControlMessagePublishResult:
    destination: str


class ControlMessagePublisher:
    def __init__(self, sender: MessageSender) -> None:
        self._sender = sender

    def publish(self, command: ControlCommand) -> ControlMessagePublishResult:
        envelope = self.build_envelope(command)
        self._sender.send(envelope)
        return ControlMessagePublishResult(destination=envelope.destination)

    def build_envelope(self, command: ControlCommand) -> MessageEnvelope:
        if command.payload_format == ControlProtocol.PROTOBUF_PAYLOAD_FORMAT:
            destination = command_topic(
                org_id=command.org_id,
                group_id=command.group_id,
                asset_id=command.cid,
            )
            payload = StreamCommandPayload.create(
                stream_id=command.stream_id,
                target_asset_id=command.cid,
                command_type=command.direction,
            ).to_protobuf_wire()
            return MessageEnvelope(
                destination=destination,
                payload=payload,
                content_type=MessageContentType.PROTOBUF,
            )

        return MessageEnvelope(
            destination=f"{ControlProtocol.TOPIC_PREFIX}/{command.cid}",
            payload=command.direction,
            content_type=MessageContentType.TEXT,
        )


@lru_cache(maxsize=1)
def get_control_message_publisher() -> ControlMessagePublisher:
    return ControlMessagePublisher(get_message_sender())
