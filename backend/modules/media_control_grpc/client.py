from __future__ import annotations

from collections.abc import Iterable, Iterator
from pathlib import Path
from typing import Protocol, cast

import grpc
from pydantic import Field, model_validator

from core.settings_base import BackendBaseSettings

DEFAULT_METHOD = "/gcs.saker.v1.SakerGatewayService/Exchange"


class ClosableChannel(Protocol):
    def stream_stream(self, method: str, **kwargs: object) -> "StreamCallable": ...

    def close(self) -> None: ...


class StreamCallable(Protocol):
    def __call__(
        self,
        payloads: Iterator[bytes],
        *,
        metadata: tuple[tuple[str, str], ...],
        timeout: float,
    ) -> Iterable[bytes]: ...


class MediaControlGrpcSettings(BackendBaseSettings):
    target: str = Field("", validation_alias="MEDIA_CONTROL_GRPC_TARGET")
    ca_file: str = Field("", validation_alias="MEDIA_CONTROL_GRPC_CA_FILE")
    cert_file: str = Field("", validation_alias="MEDIA_CONTROL_GRPC_CERT_FILE")
    key_file: str = Field("", validation_alias="MEDIA_CONTROL_GRPC_KEY_FILE")
    server_name: str = Field("", validation_alias="MEDIA_CONTROL_GRPC_SERVER_NAME")
    allow_plaintext: bool = Field(False, validation_alias="MEDIA_CONTROL_GRPC_ALLOW_PLAINTEXT")
    timeout_seconds: float = Field(2.0, validation_alias="MEDIA_CONTROL_GRPC_TIMEOUT_SECONDS", gt=0, le=30)

    @model_validator(mode="after")
    def validate_transport(self) -> "MediaControlGrpcSettings":
        if not self.target:
            raise ValueError("Media Control gRPC target is required")
        if not self.allow_plaintext and not all((self.ca_file, self.cert_file, self.key_file, self.server_name)):
            raise ValueError("Media Control gRPC mTLS files and server name are required")
        return self


class MediaControlGrpcClient:
    def __init__(self, settings: MediaControlGrpcSettings, channel: ClosableChannel | None = None) -> None:
        self.settings = settings
        self._channel = channel or create_channel(settings)
        self._closed = False

    def exchange(self, payloads: Iterable[bytes], metadata: tuple[tuple[str, str], ...]) -> Iterator[bytes]:
        if self._closed:
            raise RuntimeError("Media Control gRPC client is closed")
        call = self._channel.stream_stream(
            DEFAULT_METHOD,
            request_serializer=identity_bytes,
            response_deserializer=identity_bytes,
        )
        return iter(call(iter(payloads), metadata=metadata, timeout=self.settings.timeout_seconds))

    def close(self) -> None:
        if not self._closed:
            self._channel.close()
            self._closed = True

    def __enter__(self) -> "MediaControlGrpcClient":
        return self

    def __exit__(self, *_: object) -> None:
        self.close()


def create_channel(settings: MediaControlGrpcSettings) -> ClosableChannel:
    if settings.allow_plaintext:
        return cast(ClosableChannel, grpc.insecure_channel(settings.target))
    credentials = grpc.ssl_channel_credentials(
        root_certificates=Path(settings.ca_file).read_bytes(),
        private_key=Path(settings.key_file).read_bytes(),
        certificate_chain=Path(settings.cert_file).read_bytes(),
    )
    return cast(
        ClosableChannel,
        grpc.secure_channel(
            settings.target,
            credentials,
            options=(("grpc.ssl_target_name_override", settings.server_name),),
        ),
    )


def identity_bytes(payload: bytes) -> bytes:
    return payload
