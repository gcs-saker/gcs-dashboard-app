from __future__ import annotations

from collections.abc import Iterable, Iterator

import pytest
from pydantic import ValidationError

from modules.media_control_grpc.client import DEFAULT_METHOD, MediaControlGrpcClient, MediaControlGrpcSettings


class RecordingCall:
    def __init__(self) -> None:
        self.invocations: list[tuple[list[bytes], tuple[tuple[str, str], ...], float]] = []

    def __call__(
        self,
        payloads: Iterator[bytes],
        *,
        metadata: tuple[tuple[str, str], ...],
        timeout: float,
    ) -> Iterable[bytes]:
        values = list(payloads)
        self.invocations.append((values, metadata, timeout))
        return values


class RecordingChannel:
    def __init__(self) -> None:
        self.call = RecordingCall()
        self.methods: list[str] = []
        self.close_count = 0

    def stream_stream(self, method: str, **_: object) -> RecordingCall:
        self.methods.append(method)
        return self.call

    def close(self) -> None:
        self.close_count += 1


def secure_settings() -> MediaControlGrpcSettings:
    return MediaControlGrpcSettings(
        MEDIA_CONTROL_GRPC_TARGET="media-control:9090",
        MEDIA_CONTROL_GRPC_CA_FILE="/pki/ca.crt",
        MEDIA_CONTROL_GRPC_CERT_FILE="/pki/backend.crt",
        MEDIA_CONTROL_GRPC_KEY_FILE="/pki/backend.key",
        MEDIA_CONTROL_GRPC_SERVER_NAME="media-control",
        MEDIA_CONTROL_GRPC_TIMEOUT_SECONDS=3,
    )


def test_client_reuses_channel_applies_timeout_and_closes_once() -> None:
    channel = RecordingChannel()
    client = MediaControlGrpcClient(secure_settings(), channel)
    metadata = (("authorization", "Bearer opaque"),)

    assert list(client.exchange((b"one", b"two"), metadata)) == [b"one", b"two"]
    assert list(client.exchange((b"three",), metadata)) == [b"three"]
    client.close()
    client.close()

    assert channel.methods == [DEFAULT_METHOD, DEFAULT_METHOD]
    assert all(invocation[2] == 3 for invocation in channel.call.invocations)
    assert channel.close_count == 1


def test_settings_reject_missing_mtls_material_unless_local_test_is_explicit() -> None:
    with pytest.raises(ValidationError, match="mTLS"):
        MediaControlGrpcSettings(MEDIA_CONTROL_GRPC_TARGET="media-control:9090")

    settings = MediaControlGrpcSettings(
        MEDIA_CONTROL_GRPC_TARGET="127.0.0.1:9090",
        MEDIA_CONTROL_GRPC_ALLOW_PLAINTEXT=True,
    )
    assert settings.allow_plaintext is True
