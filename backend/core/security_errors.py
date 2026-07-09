from __future__ import annotations

from fastapi import HTTPException, status

from core.auth_config import AuthConfigError
from core.security_contract import BEARER_AUTH_HEADER


def unauthorized(detail: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers=BEARER_AUTH_HEADER,
    )


def configuration_error(exc: AuthConfigError) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail=str(exc),
    )
