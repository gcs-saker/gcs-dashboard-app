from dataclasses import dataclass, field
from typing import Literal

from model.stream_model import StreamPath, validate_stream_path

StreamStatus = Literal["registered", "online", "offline", "unknown"]


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


@dataclass(frozen=True)
class StreamingModuleStatus:
    registry_ready: bool
    playback_url_builder_ready: bool
    registered_streams: int
