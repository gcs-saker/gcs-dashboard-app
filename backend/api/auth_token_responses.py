from __future__ import annotations

from core.security import AuthConfigError, AuthSettings, create_access_token, create_refresh_token, normalize_role
from api.contracts import AuthProtocol
from api.errors import ServiceUnavailableApiError
from model.user_model import TokenResponse


def load_auth_settings() -> AuthSettings:
    try:
        return AuthSettings.from_env()
    except AuthConfigError as exc:
        raise ServiceUnavailableApiError(str(exc)) from exc


def create_login_token_response(username: str, role: str | None, settings: AuthSettings) -> tuple[TokenResponse, str]:
    access_token = create_access_token(username, role, settings=settings)
    refresh_token = create_refresh_token(username, role, settings=settings)
    return token_response(username, role, access_token, settings), refresh_token


def create_refreshed_token_response(username: str, role: str | None, settings: AuthSettings) -> tuple[TokenResponse, str]:
    access_token = create_access_token(username, role, settings=settings)
    refresh_token = create_refresh_token(username, role, settings=settings)
    return token_response(username, role, access_token, settings), refresh_token


def token_response(username: str, role: str | None, access_token: str, settings: AuthSettings) -> TokenResponse:
    return TokenResponse(
        access_token=access_token,
        token_type=AuthProtocol.BEARER_TOKEN_TYPE,
        expires_in_minutes=settings.access_token_expire_minutes,
        username=username,
        role=normalize_role(role),
    )
