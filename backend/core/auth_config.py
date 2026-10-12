from __future__ import annotations

import os
from pathlib import Path
from typing import Literal

from pydantic import Field, SecretStr, ValidationError, field_validator, model_validator

from core.settings_base import BackendBaseSettings, SettingsConfigurationError, settings_error_message

AUTH_JWT_SECRET = "AUTH_JWT_SECRET"
AUTH_JWT_SECRET_FILE = "AUTH_JWT_SECRET_FILE"
AUTH_JWT_ALGORITHM = "AUTH_JWT_ALGORITHM"
AUTH_JWT_ISSUER = "AUTH_JWT_ISSUER"
AUTH_ACCESS_TOKEN_EXPIRE_MINUTES = "AUTH_ACCESS_TOKEN_EXPIRE_MINUTES"
AUTH_REFRESH_TOKEN_EXPIRE_MINUTES = "AUTH_REFRESH_TOKEN_EXPIRE_MINUTES"
AUTH_REFRESH_COOKIE_NAME = "AUTH_REFRESH_COOKIE_NAME"
AUTH_REFRESH_COOKIE_SECURE = "AUTH_REFRESH_COOKIE_SECURE"
AUTH_REFRESH_COOKIE_SAMESITE = "AUTH_REFRESH_COOKIE_SAMESITE"
DEFAULT_JWT_ALGORITHM = "HS256"
DEFAULT_ACCESS_TOKEN_EXPIRE_MINUTES = 30
DEFAULT_REFRESH_TOKEN_EXPIRE_MINUTES = 120
DEFAULT_JWT_ISSUER = "gcs-saker"
DEFAULT_REFRESH_COOKIE_NAME = "gcs_saker_refresh"
DEFAULT_REFRESH_COOKIE_SAMESITE: Literal["lax", "strict", "none"] = "lax"
MIN_SECRET_LENGTH = 32
MAX_SECRET_FILE_BYTES = 4096
DEFAULT_SECRET_FILE = Path("/run/secrets/AUTH_JWT_SECRET")


class AuthConfigError(SettingsConfigurationError):
    pass


class AuthSettings(BackendBaseSettings):
    secret: SecretStr = Field(validation_alias=AUTH_JWT_SECRET)
    algorithm: str = Field(DEFAULT_JWT_ALGORITHM, validation_alias=AUTH_JWT_ALGORITHM)
    access_token_expire_minutes: int = Field(
        DEFAULT_ACCESS_TOKEN_EXPIRE_MINUTES,
        validation_alias=AUTH_ACCESS_TOKEN_EXPIRE_MINUTES,
        gt=0,
    )
    refresh_token_expire_minutes: int = Field(
        DEFAULT_REFRESH_TOKEN_EXPIRE_MINUTES,
        validation_alias=AUTH_REFRESH_TOKEN_EXPIRE_MINUTES,
        gt=0,
    )
    issuer: str = Field(DEFAULT_JWT_ISSUER, validation_alias=AUTH_JWT_ISSUER)
    refresh_cookie_name: str = Field(DEFAULT_REFRESH_COOKIE_NAME, validation_alias=AUTH_REFRESH_COOKIE_NAME)
    refresh_cookie_secure: bool = Field(True, validation_alias=AUTH_REFRESH_COOKIE_SECURE)
    refresh_cookie_samesite: Literal["lax", "strict", "none"] = Field(
        DEFAULT_REFRESH_COOKIE_SAMESITE,
        validation_alias=AUTH_REFRESH_COOKIE_SAMESITE,
    )

    @field_validator("secret")
    @classmethod
    def validate_secret_length(cls, secret: SecretStr) -> SecretStr:
        if len(secret.get_secret_value()) < MIN_SECRET_LENGTH:
            raise ValueError(f"{AUTH_JWT_SECRET} must be set to at least {MIN_SECRET_LENGTH} characters")
        return secret

    @model_validator(mode="after")
    def validate_cookie_security(self) -> "AuthSettings":
        if self.refresh_cookie_samesite == "none" and not self.refresh_cookie_secure:
            raise ValueError("SameSite=None refresh cookies require Secure=true")
        return self

    @classmethod
    def from_env(cls) -> "AuthSettings":
        try:
            secret = auth_secret_file_value()
            return cls(secret=secret) if secret is not None else cls()
        except ValidationError as exc:
            if any(AUTH_JWT_SECRET in error.get("loc", ()) for error in exc.errors()):
                raise AuthConfigError(
                    f"{AUTH_JWT_SECRET} must be set to at least {MIN_SECRET_LENGTH} characters"
                ) from exc
            raise AuthConfigError(settings_error_message("auth", exc)) from exc


def auth_secret_file_value() -> str | None:
    environment_value = os.getenv(AUTH_JWT_SECRET, "").strip()
    configured_file = os.getenv(AUTH_JWT_SECRET_FILE, "").strip()
    secret_file = configured_secret_file(configured_file)
    if environment_value and secret_file is not None:
        raise AuthConfigError(f"{AUTH_JWT_SECRET} and {AUTH_JWT_SECRET_FILE} cannot both be configured")
    if environment_value or secret_file is None:
        return None
    return read_auth_secret(secret_file)


def configured_secret_file(configured_file: str) -> Path | None:
    if not configured_file:
        return DEFAULT_SECRET_FILE if DEFAULT_SECRET_FILE.is_file() else None
    secret_file = Path(configured_file)
    if not secret_file.is_absolute() or not secret_file.is_file():
        raise AuthConfigError(f"{AUTH_JWT_SECRET_FILE} must reference an existing absolute file")
    return secret_file


def read_auth_secret(secret_file: Path) -> str:
    if secret_file.stat().st_size > MAX_SECRET_FILE_BYTES:
        raise AuthConfigError(f"{AUTH_JWT_SECRET_FILE} exceeds the size limit")
    try:
        value = secret_file.read_text(encoding="utf-8").strip()
    except UnicodeError as exc:
        raise AuthConfigError(f"{AUTH_JWT_SECRET_FILE} must contain UTF-8 text") from exc
    except OSError as exc:
        raise AuthConfigError(f"{AUTH_JWT_SECRET_FILE} cannot be read") from exc
    if not value:
        raise AuthConfigError(f"{AUTH_JWT_SECRET_FILE} must not be empty")
    return value
