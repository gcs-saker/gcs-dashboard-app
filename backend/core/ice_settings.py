from __future__ import annotations

from dataclasses import dataclass

from pydantic import Field, ValidationError, field_validator

from core.env_parsing import empty_to_none
from core.settings_base import BackendBaseSettings, SettingsConfigurationError, settings_error_message

DEFAULT_WEBRTC_STUN_URL = "stun:stun.l.google.com:19302"
WEBRTC_STUN_URL_ENV = "WEBRTC_STUN_URL"
WEBRTC_TURN_URL_ENV = "WEBRTC_TURN_URL"
WEBRTC_TURN_USERNAME_ENV = "WEBRTC_TURN_USERNAME"
WEBRTC_TURN_PASSWORD_ENV = "WEBRTC_TURN_PASSWORD"
MEDIAMTX_TURN_URL_ENV = "MEDIAMTX_TURN_URL"
MEDIAMTX_TURN_USERNAME_ENV = "MEDIAMTX_TURN_USERNAME"
MEDIAMTX_TURN_PASSWORD_ENV = "MEDIAMTX_TURN_PASSWORD"


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


class WebRtcIceSettings(BackendBaseSettings):
    stun_url: str | None = Field(DEFAULT_WEBRTC_STUN_URL, validation_alias=WEBRTC_STUN_URL_ENV)
    turn_url: str | None = Field(None, validation_alias=WEBRTC_TURN_URL_ENV)
    turn_username: str | None = Field(None, validation_alias=WEBRTC_TURN_USERNAME_ENV)
    turn_password: str | None = Field(None, validation_alias=WEBRTC_TURN_PASSWORD_ENV)
    mediamtx_turn_url: str | None = Field(None, validation_alias=MEDIAMTX_TURN_URL_ENV)
    mediamtx_turn_username: str | None = Field(None, validation_alias=MEDIAMTX_TURN_USERNAME_ENV)
    mediamtx_turn_password: str | None = Field(None, validation_alias=MEDIAMTX_TURN_PASSWORD_ENV)

    @field_validator("*", mode="before")
    @classmethod
    def empty_string_to_none(cls, value: object) -> object:
        if isinstance(value, str):
            return empty_to_none(value)
        return value

    @classmethod
    def from_env(cls) -> "WebRtcIceSettings":
        try:
            settings = cls()
        except ValidationError as exc:
            raise SettingsConfigurationError(settings_error_message("webrtc ice", exc)) from exc
        return settings.with_legacy_mediamtx_fallbacks()

    def with_legacy_mediamtx_fallbacks(self) -> "WebRtcIceSettings":
        return self.model_copy(
            update={
                "stun_url": self.stun_url or DEFAULT_WEBRTC_STUN_URL,
                "turn_url": self.turn_url or self.mediamtx_turn_url,
                "turn_username": self.turn_username or self.mediamtx_turn_username,
                "turn_password": self.turn_password or self.mediamtx_turn_password,
            }
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
