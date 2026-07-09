from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

import jwt

from core.auth_config import AuthSettings
from core.security_contract import (
    INVALID_TOKEN_DETAIL,
    JWT_CLAIM_EXPIRES_AT,
    JWT_CLAIM_ISSUED_AT,
    JWT_CLAIM_ISSUER,
    JWT_CLAIM_ROLE,
    JWT_CLAIM_SUBJECT,
    JWT_CLAIM_TOKEN_USE,
    ROLE_ORDER,
    ROLE_VIEWER,
    TOKEN_EXPIRED_DETAIL,
    TOKEN_TYPE_ACCESS,
    TOKEN_TYPE_REFRESH,
    TokenUse,
    UserRole,
)
from core.security_errors import unauthorized


@dataclass(frozen=True)
class AuthenticatedUser:
    username: str
    role: UserRole


def normalize_role(role: str | None) -> UserRole:
    if role in ROLE_ORDER:
        return role
    return ROLE_VIEWER


def create_access_token(
    subject: str,
    role: str | None,
    settings: AuthSettings | None = None,
    expires_delta: timedelta | None = None,
) -> str:
    auth_settings = settings or AuthSettings.from_env()
    return create_token(
        subject=subject,
        role=role,
        token_use=TOKEN_TYPE_ACCESS,
        expires_delta=expires_delta or timedelta(minutes=auth_settings.access_token_expire_minutes),
        settings=auth_settings,
    )


def create_refresh_token(
    subject: str,
    role: str | None,
    settings: AuthSettings | None = None,
    expires_delta: timedelta | None = None,
) -> str:
    auth_settings = settings or AuthSettings.from_env()
    return create_token(
        subject=subject,
        role=role,
        token_use=TOKEN_TYPE_REFRESH,
        expires_delta=expires_delta or timedelta(minutes=auth_settings.refresh_token_expire_minutes),
        settings=auth_settings,
    )


def create_token(
    subject: str,
    role: str | None,
    token_use: TokenUse,
    expires_delta: timedelta,
    settings: AuthSettings,
) -> str:
    now = datetime.now(timezone.utc)
    expire = now + expires_delta
    payload = {
        JWT_CLAIM_SUBJECT: subject,
        JWT_CLAIM_ROLE: normalize_role(role),
        JWT_CLAIM_TOKEN_USE: token_use,
        JWT_CLAIM_ISSUED_AT: int(now.timestamp()),
        JWT_CLAIM_EXPIRES_AT: expire,
        JWT_CLAIM_ISSUER: settings.issuer,
    }
    return jwt.encode(payload, settings.secret.get_secret_value(), algorithm=settings.algorithm)


def decode_access_token(token: str, settings: AuthSettings | None = None) -> AuthenticatedUser:
    return decode_token(token, TOKEN_TYPE_ACCESS, settings)


def decode_refresh_token(token: str, settings: AuthSettings | None = None) -> AuthenticatedUser:
    return decode_token(token, TOKEN_TYPE_REFRESH, settings)


def decode_token(
    token: str,
    expected_token_use: TokenUse,
    settings: AuthSettings | None = None,
) -> AuthenticatedUser:
    auth_settings = settings or AuthSettings.from_env()
    try:
        payload = jwt.decode(
            token,
            auth_settings.secret.get_secret_value(),
            algorithms=[auth_settings.algorithm],
            issuer=auth_settings.issuer,
        )
    except jwt.ExpiredSignatureError as exc:
        raise unauthorized(TOKEN_EXPIRED_DETAIL) from exc
    except jwt.PyJWTError as exc:
        raise unauthorized(INVALID_TOKEN_DETAIL) from exc

    subject = payload.get(JWT_CLAIM_SUBJECT)
    token_use = payload.get(JWT_CLAIM_TOKEN_USE)
    if not isinstance(subject, str) or token_use != expected_token_use:
        raise unauthorized(INVALID_TOKEN_DETAIL)

    return AuthenticatedUser(username=subject, role=normalize_role(payload.get(JWT_CLAIM_ROLE)))
