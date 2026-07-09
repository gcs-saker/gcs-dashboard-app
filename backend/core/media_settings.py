from __future__ import annotations

from pydantic import Field, ValidationError, field_validator

from core.env_parsing import empty_to_none
from core.settings_base import BackendBaseSettings, SettingsConfigurationError, settings_error_message


class MediaServerSettings(BackendBaseSettings):
    public_webrtc_base_url: str | None = Field(None, validation_alias="MEDIAMTX_PUBLIC_WEBRTC_BASE_URL")
    public_hls_base_url: str | None = Field(None, validation_alias="MEDIAMTX_PUBLIC_HLS_BASE_URL")
    api_base_url: str | None = Field(None, validation_alias="MEDIAMTX_API_BASE_URL")

    @field_validator("*", mode="before")
    @classmethod
    def empty_string_to_none(cls, value: object) -> object:
        if isinstance(value, str):
            return empty_to_none(value)
        return value

    @classmethod
    def from_env(cls) -> "MediaServerSettings":
        try:
            return cls()
        except ValidationError as exc:
            raise SettingsConfigurationError(settings_error_message("media server", exc)) from exc
