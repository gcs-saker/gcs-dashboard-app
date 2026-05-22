from dataclasses import dataclass

from model.stream_model import StreamPath
from modules.streaming.domain import PlaybackUrls


@dataclass(frozen=True)
class PlaybackUrlBuilderConfig:
    webrtc_base_url: str | None = None
    hls_base_url: str | None = None


class PlaybackUrlBuilder:
    def __init__(self, config: PlaybackUrlBuilderConfig | None = None) -> None:
        self.config = config or PlaybackUrlBuilderConfig()

    def build(self, stream_path: StreamPath) -> PlaybackUrls:
        return PlaybackUrls(
            webrtc=self._join(self.config.webrtc_base_url, stream_path.path),
            hls=self._join(self.config.hls_base_url, stream_path.path),
        )

    @staticmethod
    def _join(base_url: str | None, stream_path: str) -> str | None:
        if base_url is None:
            return None
        return f"{base_url.rstrip('/')}/{stream_path.lstrip('/')}"
