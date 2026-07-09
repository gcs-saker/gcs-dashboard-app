from __future__ import annotations

import os
from dataclasses import dataclass

from core.env_parsing import empty_to_none

DEFAULT_WEBRTC_STUN_URL = "stun:stun.l.google.com:19302"


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
class WebRtcIceSettings:
    stun_url: str | None = DEFAULT_WEBRTC_STUN_URL
    turn_url: str | None = None
    turn_username: str | None = None
    turn_password: str | None = None

    @classmethod
    def from_env(cls) -> "WebRtcIceSettings":
        return cls(
            stun_url=empty_to_none(os.getenv("WEBRTC_STUN_URL")) or DEFAULT_WEBRTC_STUN_URL,
            turn_url=empty_to_none(os.getenv("WEBRTC_TURN_URL")) or empty_to_none(os.getenv("MEDIAMTX_TURN_URL")),
            turn_username=empty_to_none(os.getenv("WEBRTC_TURN_USERNAME"))
            or empty_to_none(os.getenv("MEDIAMTX_TURN_USERNAME")),
            turn_password=empty_to_none(os.getenv("WEBRTC_TURN_PASSWORD"))
            or empty_to_none(os.getenv("MEDIAMTX_TURN_PASSWORD")),
        )

    def browser_ice_servers(self) -> tuple[dict[str, str], ...]:
        return self.browser_ice_server_list().to_api_response()

    def browser_ice_server_list(self) -> BrowserIceServerList:
        servers: list[BrowserIceServer] = []
        if self.stun_url:
            servers.append(BrowserIceServer.stun(self.stun_url))
        if self.turn_url and self.turn_username and self.turn_password:
            servers.append(BrowserIceServer.turn(self.turn_url, self.turn_username, self.turn_password))
        return BrowserIceServerList.of(tuple(servers))
