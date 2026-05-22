from dataclasses import dataclass, field
from typing import Literal

from model.stream_model import StreamPath, validate_stream_path

StreamStatus = Literal["registered", "online", "offline", "unknown"]
STREAM_STATUSES: tuple[StreamStatus, ...] = ("registered", "online", "offline", "unknown")


@dataclass(frozen=True)
class PlaybackUrls:
    webrtc: str | None = None
    hls: str | None = None

    @property
    def has_playback_url(self) -> bool:
        return self.webrtc is not None or self.hls is not None


@dataclass(frozen=True)
class StreamDescriptor:
    stream_path: StreamPath
    status: StreamStatus = "registered"
    display_name: str | None = None
    playback_urls: PlaybackUrls = field(default_factory=PlaybackUrls)

    def __post_init__(self) -> None:
        object.__setattr__(self, "status", validate_stream_status(self.status))

    @classmethod
    def from_path(
        cls,
        path: str,
        *,
        status: StreamStatus = "registered",
        display_name: str | None = None,
        playback_urls: PlaybackUrls | None = None,
    ) -> "StreamDescriptor":
        return cls(
            stream_path=validate_stream_path(path),
            status=status,
            display_name=display_name,
            playback_urls=playback_urls or PlaybackUrls(),
        )

    @property
    def path(self) -> str:
        return self.stream_path.path

    @property
    def stream_id(self) -> str:
        return self.stream_path.stream_id


def validate_stream_status(status: str) -> StreamStatus:
    if status not in STREAM_STATUSES:
        raise ValueError("stream status must be one of registered, online, offline, unknown")
    return status


@dataclass(frozen=True)
class StreamingModuleStatus:
    registry_ready: bool
    playback_url_builder_ready: bool
    registered_streams: int
