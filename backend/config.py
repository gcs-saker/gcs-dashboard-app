from dataclasses import dataclass
import os


@dataclass(frozen=True)
class MediaServerSettings:
    public_webrtc_base_url: str | None = None
    public_hls_base_url: str | None = None

    @classmethod
    def from_env(cls) -> "MediaServerSettings":
        return cls(
            public_webrtc_base_url=_empty_to_none(os.getenv("MEDIAMTX_PUBLIC_WEBRTC_BASE_URL")),
            public_hls_base_url=_empty_to_none(os.getenv("MEDIAMTX_PUBLIC_HLS_BASE_URL")),
        )


def _empty_to_none(value: str | None) -> str | None:
    if value is None:
        return None
    value = value.strip()
    return value or None
