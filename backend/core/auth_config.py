from __future__ import annotations

from typing import Literal

from pydantic import Field, SecretStr, ValidationError, field_validator, model_validator

from core.settings_base import BackendBaseSettings, SettingsConfigurationError, settings_error_message

AUTH_JWT_SECRET = "AUTH_JWT_SECRET"
AUTH_JWT_ALGORITHM = "AUTH_JWT_ALGORITHM"
AUTH_JWT_ISSUER = "AUTH_JWT_ISSUER"
AUTH_ACCESS_TOKEN_EXPIRE_MINUTES = "AUTH_ACCESS_TOKEN_EXPIRE_MINUTES"
AUTH_REFRESH_TOKEN_EXPIRE_MINUTES = "AUTH_REFRESH_TOKEN_EXPIRE_MINUTES"
AUTH_REFRESH_COOKIE_NAME = "AUTH_REFRESH_COOKIE_NAME"
AUTH_REFRESH_COOKIE_SECURE = "AUTH_REFRESH_COOKIE_SECURE"
AUTH_REFRESH_COOKIE_SAMESITE = "AUTH_REFRESH_COOKIE_SAMESITE"
DEFAULT_JWT_ALGORITHM = "HS256"
DEFAULT_ACCESS_TOKEN_EXPIRE_MINUTES = 30
DEFAULT_REFRESH_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7
DEFAULT_JWT_ISSUER = "gcs-saker"
DEFAULT_REFRESH_COOKIE_NAME = "gcs_saker_refresh"
DEFAULT_REFRESH_COOKIE_SAMESITE: Literal["lax", "strict", "none"] = "lax"
MIN_SECRET_LENGTH = 32


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
            return cls()
        except ValidationError as exc:
            if any(AUTH_JWT_SECRET in error.get("loc", ()) for error in exc.errors()):
                raise AuthConfigError(
                    f"{AUTH_JWT_SECRET} must be set to at least {MIN_SECRET_LENGTH} characters"
                ) from exc
            raise AuthConfigError(settings_error_message("auth", exc)) from exc
