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


class AuthConfigError(RuntimeError):
    pass


@dataclass(frozen=True)
class AuthSettings:
    secret: str
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    issuer: str = "gcs-saker"

    @classmethod
    def from_env(cls) -> "AuthSettings":
        secret = (os.getenv("AUTH_JWT_SECRET") or "").strip()
        if len(secret) < 32:
            raise AuthConfigError("AUTH_JWT_SECRET must be set to at least 32 characters")

        expire_minutes = os.getenv("AUTH_ACCESS_TOKEN_EXPIRE_MINUTES", "30").strip()
        try:
            parsed_expire_minutes = int(expire_minutes)
        except ValueError as exc:
            raise AuthConfigError("AUTH_ACCESS_TOKEN_EXPIRE_MINUTES must be an integer") from exc
        if parsed_expire_minutes <= 0:
            raise AuthConfigError("AUTH_ACCESS_TOKEN_EXPIRE_MINUTES must be positive")

        return cls(
            secret=secret,
            algorithm=os.getenv("AUTH_JWT_ALGORITHM", cls.algorithm).strip() or cls.algorithm,
            access_token_expire_minutes=parsed_expire_minutes,
            issuer=os.getenv("AUTH_JWT_ISSUER", cls.issuer).strip() or cls.issuer,
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


def decode_access_token(token: str, settings: AuthSettings | None = None) -> AuthenticatedUser:
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
    if not isinstance(subject, str) or token_use != TOKEN_TYPE_ACCESS:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return AuthenticatedUser(username=subject, role=normalize_role(payload.get("role")))


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
