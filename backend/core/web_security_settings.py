from __future__ import annotations

from pydantic import Field, ValidationError, field_validator

from core.env_parsing import csv_to_tuple, empty_to_none
from core.settings_base import BackendBaseSettings, SettingsConfigurationError, settings_error_message

DEFAULT_ALLOWED_ORIGINS = (
    "http://localhost:5173",
    "http://localhost:5174",
)

DEFAULT_CONTENT_SECURITY_POLICY = (
    "default-src 'self'; "
    "script-src 'self'; "
    "style-src 'self' 'unsafe-inline' https://unpkg.com; "
    "img-src 'self' data: blob: https://tiles.openfreemap.org https://services.arcgisonline.com; "
    "connect-src 'self' https: wss:; "
    "media-src 'self' blob: https:; "
    "worker-src 'self' blob:; "
    "object-src 'none'; "
    "base-uri 'self'; "
    "frame-ancestors 'none'"
)


class WebSecuritySettings(BackendBaseSettings):
    allowed_origins: tuple[str, ...] = Field(DEFAULT_ALLOWED_ORIGINS, validation_alias="BACKEND_CORS_ALLOW_ORIGINS")
    content_security_policy: str = Field(
        DEFAULT_CONTENT_SECURITY_POLICY,
        validation_alias="BACKEND_CONTENT_SECURITY_POLICY",
    )

    @field_validator("allowed_origins", mode="before")
    @classmethod
    def parse_allowed_origins(cls, value: object) -> object:
        if isinstance(value, str):
            return csv_to_tuple(value) or DEFAULT_ALLOWED_ORIGINS
        return value

    @field_validator("content_security_policy", mode="before")
    @classmethod
    def default_content_security_policy(cls, value: object) -> object:
        if isinstance(value, str):
            return empty_to_none(value) or DEFAULT_CONTENT_SECURITY_POLICY
        return value

    @classmethod
    def from_env(cls) -> "WebSecuritySettings":
        try:
            return cls()
        except ValidationError as exc:
            raise SettingsConfigurationError(settings_error_message("web security", exc)) from exc
