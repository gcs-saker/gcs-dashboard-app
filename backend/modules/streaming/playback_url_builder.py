from dataclasses import dataclass
from urllib.parse import urlparse

from config import MediaServerSettings
from model.stream_model import StreamPath, validate_stream_id
from modules.streaming.domain import PlaybackUrls


class PlaybackUrlBuilderError(ValueError):
    """Raised when playback URL configuration cannot produce valid public URLs."""


@dataclass(frozen=True)
class PlaybackUrlBuilderConfig:
    public_webrtc_base_url: str | None = None
    public_hls_base_url: str | None = None
    webrtc_base_url: str | None = None
    hls_base_url: str | None = None

    @classmethod
    def from_env(cls) -> "PlaybackUrlBuilderConfig":
        settings = MediaServerSettings.from_env()
        return cls(
            public_webrtc_base_url=settings.public_webrtc_base_url,
            public_hls_base_url=settings.public_hls_base_url,
        )

    @property
    def resolved_webrtc_base_url(self) -> str | None:
        return self.public_webrtc_base_url or self.webrtc_base_url

    @property
    def resolved_hls_base_url(self) -> str | None:
        return self.public_hls_base_url or self.hls_base_url


class PlaybackUrlBuilder:
    def __init__(self, config: PlaybackUrlBuilderConfig | None = None) -> None:
        self.config = config or PlaybackUrlBuilderConfig()

    @classmethod
    def from_env(cls) -> "PlaybackUrlBuilder":
        return cls(PlaybackUrlBuilderConfig.from_env())

    def build(self, stream_path: StreamPath) -> PlaybackUrls:
        return PlaybackUrls(
            webrtc=self._join(self.config.resolved_webrtc_base_url, stream_path.path, "whep"),
            hls=self._join(self.config.resolved_hls_base_url, stream_path.path, "index.m3u8"),
        )

    def build_from_stream_id(self, stream_id: str) -> PlaybackUrls:
        return self.build(validate_stream_id(stream_id))

    @staticmethod
    def _join(base_url: str | None, stream_path: str, suffix: str) -> str | None:
        if base_url is None:
            return None
        return f"{_normalize_base_url(base_url)}/{stream_path.lstrip('/')}/{suffix}"


def _normalize_base_url(base_url: str) -> str:
    normalized = base_url.strip().rstrip("/")
    parsed = urlparse(normalized)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise PlaybackUrlBuilderError("playback base URL must be an absolute HTTP(S) URL")
    return normalized
