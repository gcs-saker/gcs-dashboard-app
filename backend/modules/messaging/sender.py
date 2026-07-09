from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from typing import Iterable, Protocol

from pydantic import Field, ValidationError, field_validator

from core.env_parsing import empty_to_none
from core.settings_base import BackendBaseSettings, settings_error_message
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
    def send(self, envelope: MessageEnvelope) -> None: ...


class GrpcStreamTransport(Protocol):
    def send(self, payload: bytes) -> None: ...


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
        try:
            settings = GrpcTransportSettings()
        except ValidationError as exc:
            raise MessageSenderUnavailable(settings_error_message("grpc control sender", exc)) from exc
        if not settings.target:
            raise MessageSenderUnavailable("gRPC gateway target is not configured")
        return cls(
            target=settings.target,
            method=settings.method,
            auth_token=settings.auth_token or "",
            timeout_seconds=settings.timeout_seconds,
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


class GrpcTransportSettings(BackendBaseSettings):
    target: str | None = Field(None, validation_alias=MessageSenderEnv.GRPC_TARGET)
    method: str = Field(GrpcContracts.DEFAULT_METHOD, validation_alias=MessageSenderEnv.GRPC_METHOD)
    auth_token: str | None = Field(None, validation_alias=MessageSenderEnv.GRPC_AUTH_TOKEN)
    timeout_seconds: float = Field(
        GrpcContracts.DEFAULT_TIMEOUT_SECONDS,
        validation_alias=MessageSenderEnv.GRPC_TIMEOUT_SECONDS,
        gt=0,
    )

    @field_validator("target", "auth_token", mode="before")
    @classmethod
    def blank_string_to_none(cls, value: object) -> object:
        if isinstance(value, str):
            return empty_to_none(value)
        return value

    @field_validator("method", mode="before")
    @classmethod
    def default_method(cls, value: object) -> object:
        if isinstance(value, str):
            return empty_to_none(value) or GrpcContracts.DEFAULT_METHOD
        return value


class ControlMessageSenderSettings(BackendBaseSettings):
    sender_kind: str = Field(MessageSenderKind.MQTT, validation_alias=MessageSenderEnv.CONTROL_SENDER)

    @field_validator("sender_kind", mode="before")
    @classmethod
    def normalize_sender_kind(cls, value: object) -> object:
        if isinstance(value, str):
            return (empty_to_none(value) or MessageSenderKind.MQTT).lower()
        return value


@lru_cache(maxsize=1)
def get_message_sender() -> MessageSender:
    try:
        sender_kind = ControlMessageSenderSettings().sender_kind
    except ValidationError as exc:
        raise MessageSenderUnavailable(settings_error_message("control message sender", exc)) from exc
    if sender_kind == MessageSenderKind.MQTT:
        return MqttMessageSender()
    if sender_kind == MessageSenderKind.GRPC:
        return GrpcMessageSender()
    raise MessageSenderUnavailable(f"unsupported control message sender: {sender_kind}")
