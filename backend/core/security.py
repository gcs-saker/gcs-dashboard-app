from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
import os
from typing import Annotated, Literal

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
import jwt

UserRole = Literal["viewer", "operator", "admin"]

ROLE_ORDER: dict[UserRole, int] = {
    "viewer": 1,
    "operator": 2,
    "admin": 3,
}

TOKEN_TYPE_ACCESS = "access"
TOKEN_TYPE_REFRESH = "refresh"


class AuthConfigError(RuntimeError):
    pass


@dataclass(frozen=True)
class AuthSettings:
    secret: str
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    refresh_token_expire_minutes: int = 60 * 24 * 7
    issuer: str = "gcs-saker"
    refresh_cookie_name: str = "gcs_saker_refresh"
    refresh_cookie_secure: bool = True
    refresh_cookie_samesite: Literal["lax", "strict", "none"] = "lax"

    @classmethod
    def from_env(cls) -> "AuthSettings":
        secret = (os.getenv("AUTH_JWT_SECRET") or "").strip()
        if len(secret) < 32:
            raise AuthConfigError("AUTH_JWT_SECRET must be set to at least 32 characters")

        parsed_expire_minutes = _parse_positive_int_env(
            "AUTH_ACCESS_TOKEN_EXPIRE_MINUTES",
            "30",
        )
        parsed_refresh_expire_minutes = _parse_positive_int_env(
            "AUTH_REFRESH_TOKEN_EXPIRE_MINUTES",
            str(cls.refresh_token_expire_minutes),
        )
        refresh_cookie_samesite = _parse_cookie_samesite(
            os.getenv("AUTH_REFRESH_COOKIE_SAMESITE", cls.refresh_cookie_samesite),
        )

        return cls(
            secret=secret,
            algorithm=os.getenv("AUTH_JWT_ALGORITHM", cls.algorithm).strip() or cls.algorithm,
            access_token_expire_minutes=parsed_expire_minutes,
            refresh_token_expire_minutes=parsed_refresh_expire_minutes,
            issuer=os.getenv("AUTH_JWT_ISSUER", cls.issuer).strip() or cls.issuer,
            refresh_cookie_name=os.getenv("AUTH_REFRESH_COOKIE_NAME", cls.refresh_cookie_name).strip()
            or cls.refresh_cookie_name,
            refresh_cookie_secure=_parse_bool_env("AUTH_REFRESH_COOKIE_SECURE", cls.refresh_cookie_secure),
            refresh_cookie_samesite=refresh_cookie_samesite,
        )


@dataclass(frozen=True)
class AuthenticatedUser:
    username: str
    role: UserRole


bearer_scheme = HTTPBearer(auto_error=False)


def normalize_role(role: str | None) -> UserRole:
    if role in ROLE_ORDER:
        return role
    return "viewer"


def create_access_token(
    subject: str,
    role: str | None,
    settings: AuthSettings | None = None,
    expires_delta: timedelta | None = None,
) -> str:
    auth_settings = settings or AuthSettings.from_env()
    now = datetime.now(UTC)
    expire = now + (expires_delta or timedelta(minutes=auth_settings.access_token_expire_minutes))
    payload = {
        "sub": subject,
        "role": normalize_role(role),
        "token_use": TOKEN_TYPE_ACCESS,
        "iat": int(now.timestamp()),
        "exp": expire,
        "iss": auth_settings.issuer,
    }
    return jwt.encode(payload, auth_settings.secret, algorithm=auth_settings.algorithm)


def create_refresh_token(
    subject: str,
    role: str | None,
    settings: AuthSettings | None = None,
    expires_delta: timedelta | None = None,
) -> str:
    auth_settings = settings or AuthSettings.from_env()
    now = datetime.now(UTC)
    expire = now + (expires_delta or timedelta(minutes=auth_settings.refresh_token_expire_minutes))
    payload = {
        "sub": subject,
        "role": normalize_role(role),
        "token_use": TOKEN_TYPE_REFRESH,
        "iat": int(now.timestamp()),
        "exp": expire,
        "iss": auth_settings.issuer,
    }
    return jwt.encode(payload, auth_settings.secret, algorithm=auth_settings.algorithm)


def decode_access_token(token: str, settings: AuthSettings | None = None) -> AuthenticatedUser:
    return _decode_token(token, TOKEN_TYPE_ACCESS, settings)


def decode_refresh_token(token: str, settings: AuthSettings | None = None) -> AuthenticatedUser:
    return _decode_token(token, TOKEN_TYPE_REFRESH, settings)


def _decode_token(
    token: str,
    expected_token_use: str,
    settings: AuthSettings | None = None,
) -> AuthenticatedUser:
    auth_settings = settings or AuthSettings.from_env()
    try:
        payload = jwt.decode(
            token,
            auth_settings.secret,
            algorithms=[auth_settings.algorithm],
            issuer=auth_settings.issuer,
        )
    except jwt.ExpiredSignatureError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="token expired",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc
    except jwt.PyJWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid token",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc

    subject = payload.get("sub")
    token_use = payload.get("token_use")
    if not isinstance(subject, str) or token_use != expected_token_use:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return AuthenticatedUser(username=subject, role=normalize_role(payload.get("role")))


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
    raise AuthConfigError("AUTH_REFRESH_COOKIE_SAMESITE must be lax, strict, or none")


def _configuration_error(exc: AuthConfigError) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail=str(exc),
    )


def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
) -> AuthenticatedUser:
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if credentials.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="bearer token required",
            headers={"WWW-Authenticate": "Bearer"},
        )
    try:
        return decode_access_token(credentials.credentials)
    except AuthConfigError as exc:
        raise _configuration_error(exc) from exc


def require_role(minimum_role: UserRole):
    def dependency(user: Annotated[AuthenticatedUser, Depends(get_current_user)]) -> AuthenticatedUser:
        if ROLE_ORDER[user.role] < ROLE_ORDER[minimum_role]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"{minimum_role} role required",
            )
        return user

    return dependency
