from __future__ import annotations

from dataclasses import dataclass
import os

from core.env_parsing import empty_to_none


@dataclass(frozen=True)
class MediaServerSettings:
    public_webrtc_base_url: str | None = None
    public_hls_base_url: str | None = None
    api_base_url: str | None = None

    @classmethod
    def from_env(cls) -> "MediaServerSettings":
        return cls(
            public_webrtc_base_url=empty_to_none(os.getenv("MEDIAMTX_PUBLIC_WEBRTC_BASE_URL")),
            public_hls_base_url=empty_to_none(os.getenv("MEDIAMTX_PUBLIC_HLS_BASE_URL")),
            api_base_url=empty_to_none(os.getenv("MEDIAMTX_API_BASE_URL")),
        )
