from __future__ import annotations

from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from core.auth_config import AuthConfigError, AuthSettings
from core.security_contract import (
    AUTHENTICATION_REQUIRED_DETAIL,
    BEARER_TOKEN_REQUIRED_DETAIL,
    ROLE_ORDER,
    ROLE_REQUIRED_DETAIL_TEMPLATE,
    UserRole,
)
from core.security_errors import configuration_error, unauthorized
from core.security_tokens import (
    AuthenticatedUser,
    create_access_token,
    create_refresh_token,
    decode_access_token,
    decode_refresh_token,
    normalize_role,
)

__all__ = [
    "AuthenticatedUser",
    "AuthSettings",
    "create_access_token",
    "create_refresh_token",
    "decode_access_token",
    "decode_refresh_token",
    "get_current_user",
    "normalize_role",
    "require_role",
]

bearer_scheme = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
) -> AuthenticatedUser:
    if credentials is None:
        raise unauthorized(AUTHENTICATION_REQUIRED_DETAIL)
    if credentials.scheme.lower() != "bearer":
        raise unauthorized(BEARER_TOKEN_REQUIRED_DETAIL)
    try:
        return decode_access_token(credentials.credentials)
    except AuthConfigError as exc:
        raise configuration_error(exc) from exc


def require_role(minimum_role: UserRole):
    def dependency(user: Annotated[AuthenticatedUser, Depends(get_current_user)]) -> AuthenticatedUser:
        if ROLE_ORDER[user.role] < ROLE_ORDER[minimum_role]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=ROLE_REQUIRED_DETAIL_TEMPLATE.format(role=minimum_role),
            )
        return user

    return dependency
