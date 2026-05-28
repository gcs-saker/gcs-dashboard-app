from dataclasses import dataclass
import os

DEFAULT_ALLOWED_ORIGINS = (
    "http://localhost:5173",
    "http://localhost:5174",
)

DEFAULT_CONTENT_SECURITY_POLICY = (
    "default-src 'self'; "
    "script-src 'self'; "
    "style-src 'self' 'unsafe-inline' https://unpkg.com; "
    "img-src 'self' data: blob: https://*.tile.openstreetmap.org; "
    "connect-src 'self' https: wss:; "
    "media-src 'self' blob: https:; "
    "object-src 'none'; "
    "base-uri 'self'; "
    "frame-ancestors 'none'"
)


@dataclass(frozen=True)
class MediaServerSettings:
    public_webrtc_base_url: str | None = None
    public_hls_base_url: str | None = None
    api_base_url: str | None = None

    @classmethod
    def from_env(cls) -> "MediaServerSettings":
        return cls(
            public_webrtc_base_url=_empty_to_none(os.getenv("MEDIAMTX_PUBLIC_WEBRTC_BASE_URL")),
            public_hls_base_url=_empty_to_none(os.getenv("MEDIAMTX_PUBLIC_HLS_BASE_URL")),
            api_base_url=_empty_to_none(os.getenv("MEDIAMTX_API_BASE_URL")),
        )


@dataclass(frozen=True)
class WebSecuritySettings:
    allowed_origins: tuple[str, ...]
    content_security_policy: str

    @classmethod
    def from_env(cls) -> "WebSecuritySettings":
        configured_origins = _csv_to_tuple(os.getenv("BACKEND_CORS_ALLOW_ORIGINS"))
        configured_csp = _empty_to_none(os.getenv("BACKEND_CONTENT_SECURITY_POLICY"))
        return cls(
            allowed_origins=configured_origins or DEFAULT_ALLOWED_ORIGINS,
            content_security_policy=configured_csp or DEFAULT_CONTENT_SECURITY_POLICY,
        )


def _empty_to_none(value: str | None) -> str | None:
    if value is None:
        return None
    value = value.strip()
    return value or None


def _csv_to_tuple(value: str | None) -> tuple[str, ...]:
    if not value:
        return ()
    return tuple(item.strip() for item in value.split(",") if item.strip())
