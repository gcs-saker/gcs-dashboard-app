from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Literal

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


class AuthConfigError(RuntimeError):
    pass


@dataclass(frozen=True)
class AuthSettings:
    secret: str
    algorithm: str = DEFAULT_JWT_ALGORITHM
    access_token_expire_minutes: int = DEFAULT_ACCESS_TOKEN_EXPIRE_MINUTES
    refresh_token_expire_minutes: int = DEFAULT_REFRESH_TOKEN_EXPIRE_MINUTES
    issuer: str = DEFAULT_JWT_ISSUER
    refresh_cookie_name: str = DEFAULT_REFRESH_COOKIE_NAME
    refresh_cookie_secure: bool = True
    refresh_cookie_samesite: Literal["lax", "strict", "none"] = DEFAULT_REFRESH_COOKIE_SAMESITE

    @classmethod
    def from_env(cls) -> "AuthSettings":
        secret = _required_secret()
        return cls(
            secret=secret,
            algorithm=_string_env(AUTH_JWT_ALGORITHM, cls.algorithm),
            access_token_expire_minutes=_parse_positive_int_env(
                AUTH_ACCESS_TOKEN_EXPIRE_MINUTES,
                str(DEFAULT_ACCESS_TOKEN_EXPIRE_MINUTES),
            ),
            refresh_token_expire_minutes=_parse_positive_int_env(
                AUTH_REFRESH_TOKEN_EXPIRE_MINUTES,
                str(DEFAULT_REFRESH_TOKEN_EXPIRE_MINUTES),
            ),
            issuer=_string_env(AUTH_JWT_ISSUER, cls.issuer),
            refresh_cookie_name=_string_env(AUTH_REFRESH_COOKIE_NAME, cls.refresh_cookie_name),
            refresh_cookie_secure=_parse_bool_env(AUTH_REFRESH_COOKIE_SECURE, cls.refresh_cookie_secure),
            refresh_cookie_samesite=_parse_cookie_samesite(
                os.getenv(AUTH_REFRESH_COOKIE_SAMESITE, cls.refresh_cookie_samesite),
            ),
        )


def _required_secret() -> str:
    secret = (os.getenv(AUTH_JWT_SECRET) or "").strip()
    if len(secret) < MIN_SECRET_LENGTH:
        raise AuthConfigError(f"{AUTH_JWT_SECRET} must be set to at least {MIN_SECRET_LENGTH} characters")
    return secret


def _string_env(name: str, default: str) -> str:
    return os.getenv(name, default).strip() or default


def _parse_positive_int_env(name: str, default: str) -> int:
    value = os.getenv(name, default).strip()
    try:
        parsed = int(value)
    except ValueError as exc:
        raise AuthConfigError(f"{name} must be an integer") from exc
    if parsed <= 0:
        raise AuthConfigError(f"{name} must be positive")
    return parsed


def _parse_bool_env(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    normalized = raw.strip().lower()
    if normalized in {"1", "true", "yes", "on"}:
        return True
    if normalized in {"0", "false", "no", "off"}:
        return False
    raise AuthConfigError(f"{name} must be a boolean")


def _parse_cookie_samesite(value: str) -> Literal["lax", "strict", "none"]:
    normalized = value.strip().lower()
    if normalized == "lax":
        return "lax"
    if normalized == "strict":
        return "strict"
    if normalized == "none":
        return "none"
    raise AuthConfigError(f"{AUTH_REFRESH_COOKIE_SAMESITE} must be lax, strict, or none")
