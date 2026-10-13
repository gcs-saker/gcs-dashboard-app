from __future__ import annotations

from pathlib import Path

from pydantic import Field, ValidationError, field_validator

from core.env_parsing import empty_to_none
from core.secret_files import SecretFileError, read_secret_input
from core.settings_base import BackendBaseSettings, SettingsConfigurationError, settings_error_message

MEDIAMTX_API_PASSWORD = "MEDIAMTX_API_PASSWORD"
MEDIAMTX_API_PASSWORD_FILE = "MEDIAMTX_API_PASSWORD_FILE"


class MediaServerSettings(BackendBaseSettings):
    public_webrtc_base_url: str | None = Field(None, validation_alias="MEDIAMTX_PUBLIC_WEBRTC_BASE_URL")
    public_hls_base_url: str | None = Field(None, validation_alias="MEDIAMTX_PUBLIC_HLS_BASE_URL")
    api_base_url: str | None = Field(None, validation_alias="MEDIAMTX_API_BASE_URL")
    api_username: str | None = Field(None, validation_alias="MEDIAMTX_API_USER")
    api_password: str | None = Field(None, validation_alias="MEDIAMTX_API_PASSWORD")

    @field_validator("*", mode="before")
    @classmethod
    def empty_string_to_none(cls, value: object) -> object:
        if isinstance(value, str):
            return empty_to_none(value)
        return value

    @classmethod
    def from_env(cls) -> "MediaServerSettings":
        try:
            password = read_secret_input(
                MEDIAMTX_API_PASSWORD,
                MEDIAMTX_API_PASSWORD_FILE,
                Path("/run/secrets/MEDIAMTX_API_PASSWORD"),
            )
            return cls(api_password=password) if password is not None else cls()
        except SecretFileError as exc:
            raise SettingsConfigurationError(str(exc)) from exc
        except ValidationError as exc:
            raise SettingsConfigurationError(settings_error_message("media server", exc)) from exc
