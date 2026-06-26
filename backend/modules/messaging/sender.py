from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
import os
from typing import Iterable, Protocol

from mqtt.client import MqttPayload, publish_control_command


class MessageSenderEnv:
    CONTROL_SENDER = "CONTROL_MESSAGE_SENDER"
    GRPC_TARGET = "CONTROL_GRPC_TARGET"
    GRPC_METHOD = "CONTROL_GRPC_METHOD"
    GRPC_AUTH_TOKEN = "CONTROL_GRPC_AUTH_TOKEN"
    GRPC_TIMEOUT_SECONDS = "CONTROL_GRPC_TIMEOUT_SECONDS"


class MessageSenderKind:
    MQTT = "mqtt"
    GRPC = "grpc"


class MessageContentType:
    TEXT = "text/plain"
    PROTOBUF = "application/x-protobuf"


class GrpcContracts:
    DEFAULT_METHOD = "/gcs.saker.v1.SakerGatewayService/Exchange"
    AUTHORIZATION_METADATA = "authorization"
    GATEWAY_TOKEN_METADATA = "x-gcs-gateway-token"
    BEARER_PREFIX = "Bearer "
    DEFAULT_TIMEOUT_SECONDS = 2.0


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


class GrpcStreamTransport(Protocol):
    def send(self, payload: bytes) -> None:
        ...


class MqttMessageSender:
    def send(self, envelope: MessageEnvelope) -> None:
        publish_control_command(envelope.destination, envelope.payload)


class GrpcMessageSender:
    def __init__(self, transport: GrpcStreamTransport | None = None) -> None:
        self._transport = transport or GrpcRawStreamTransport.from_env()

    def send(self, envelope: MessageEnvelope) -> None:
        if envelope.content_type != MessageContentType.PROTOBUF or not isinstance(envelope.payload, bytes):
            raise MessageSenderUnavailable("gRPC message sender requires protobuf payload")
        self._transport.send(envelope.payload)


@dataclass(frozen=True)
class GrpcRawStreamTransport:
    target: str
    method: str
    auth_token: str
    timeout_seconds: float

    @classmethod
    def from_env(cls) -> "GrpcRawStreamTransport":
        target = os.getenv(MessageSenderEnv.GRPC_TARGET, "").strip()
        if not target:
            raise MessageSenderUnavailable("gRPC gateway target is not configured")
        method = os.getenv(MessageSenderEnv.GRPC_METHOD, GrpcContracts.DEFAULT_METHOD).strip()
        timeout_seconds = grpc_timeout_seconds(os.getenv(MessageSenderEnv.GRPC_TIMEOUT_SECONDS, ""))
        return cls(
            target=target,
            method=method or GrpcContracts.DEFAULT_METHOD,
            auth_token=os.getenv(MessageSenderEnv.GRPC_AUTH_TOKEN, "").strip(),
            timeout_seconds=timeout_seconds,
        )

    def send(self, payload: bytes) -> None:
        try:
            import grpc
        except ImportError as exc:
            raise MessageSenderUnavailable("grpcio is required for gRPC message sender") from exc

        channel = grpc.insecure_channel(self.target)
        stub = channel.stream_stream(
            self.method,
            request_serializer=identity_bytes,
            response_deserializer=identity_bytes,
        )
        responses: Iterable[bytes] = stub(
            iter([payload]),
            metadata=grpc_metadata(self.auth_token),
            timeout=self.timeout_seconds,
        )
        next(iter(responses), None)


def identity_bytes(payload: bytes) -> bytes:
    return payload


def grpc_metadata(auth_token: str) -> tuple[tuple[str, str], ...] | None:
    if not auth_token:
        return None
    return (
        (GrpcContracts.AUTHORIZATION_METADATA, f"{GrpcContracts.BEARER_PREFIX}{auth_token}"),
        (GrpcContracts.GATEWAY_TOKEN_METADATA, auth_token),
    )


def grpc_timeout_seconds(raw_value: str) -> float:
    try:
        timeout = float(raw_value)
    except ValueError:
        return GrpcContracts.DEFAULT_TIMEOUT_SECONDS
    if timeout <= 0:
        return GrpcContracts.DEFAULT_TIMEOUT_SECONDS
    return timeout


@lru_cache(maxsize=1)
def get_message_sender() -> MessageSender:
    sender_kind = os.getenv(MessageSenderEnv.CONTROL_SENDER, MessageSenderKind.MQTT).strip().lower()
    if sender_kind == MessageSenderKind.MQTT:
        return MqttMessageSender()
    if sender_kind == MessageSenderKind.GRPC:
        return GrpcMessageSender()
    raise MessageSenderUnavailable(f"unsupported control message sender: {sender_kind}")
