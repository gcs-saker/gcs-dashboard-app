from dataclasses import dataclass
import os

DEFAULT_WEBRTC_STUN_URL = "stun:localhost:3478"
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


class IceServerFields:
    URLS = "urls"
    USERNAME = "username"
    CREDENTIAL = "credential"


@dataclass(frozen=True)
class BrowserIceServer:
    urls: str
    username: str | None = None
    credential: str | None = None

    @classmethod
    def stun(cls, url: str) -> "BrowserIceServer":
        return cls(urls=url)

    @classmethod
    def turn(cls, url: str, username: str, credential: str) -> "BrowserIceServer":
        return cls(urls=url, username=username, credential=credential)

    def to_api_dict(self) -> dict[str, str]:
        payload = {IceServerFields.URLS: self.urls}
        if self.username is not None:
            payload[IceServerFields.USERNAME] = self.username
        if self.credential is not None:
            payload[IceServerFields.CREDENTIAL] = self.credential
        return payload


@dataclass(frozen=True)
class BrowserIceServerList:
    values: tuple[BrowserIceServer, ...]

    @classmethod
    def of(cls, servers: tuple[BrowserIceServer, ...]) -> "BrowserIceServerList":
        return cls(values=tuple(servers))

    def to_api_response(self) -> tuple[dict[str, str], ...]:
        return tuple(server.to_api_dict() for server in self.values)


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
class WebRtcIceSettings:
    stun_url: str | None = DEFAULT_WEBRTC_STUN_URL
    turn_url: str | None = None
    turn_username: str | None = None
    turn_password: str | None = None

    @classmethod
    def from_env(cls) -> "WebRtcIceSettings":
        return cls(
            stun_url=_empty_to_none(os.getenv("WEBRTC_STUN_URL")) or DEFAULT_WEBRTC_STUN_URL,
            turn_url=_empty_to_none(os.getenv("WEBRTC_TURN_URL"))
            or _empty_to_none(os.getenv("MEDIAMTX_TURN_URL")),
            turn_username=_empty_to_none(os.getenv("WEBRTC_TURN_USERNAME"))
            or _empty_to_none(os.getenv("MEDIAMTX_TURN_USERNAME")),
            turn_password=_empty_to_none(os.getenv("WEBRTC_TURN_PASSWORD"))
            or _empty_to_none(os.getenv("MEDIAMTX_TURN_PASSWORD")),
        )

    def browser_ice_servers(self) -> tuple[dict[str, str], ...]:
        return self.browser_ice_server_list().to_api_response()

    def browser_ice_server_list(self) -> BrowserIceServerList:
        servers: list[BrowserIceServer] = []
        if self.stun_url:
            servers.append(BrowserIceServer.stun(self.stun_url))
        if self.turn_url and self.turn_username and self.turn_password:
            servers.append(
                BrowserIceServer.turn(
                    self.turn_url,
                    self.turn_username,
                    self.turn_password,
                )
            )
        return BrowserIceServerList.of(tuple(servers))


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
