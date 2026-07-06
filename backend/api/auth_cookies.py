from __future__ import annotations

from fastapi import Response

from core.security import AuthSettings

REFRESH_COOKIE_PATH = "/"
SECONDS_PER_MINUTE = 60


def set_refresh_cookie(response: Response, refresh_token: str, auth_settings: AuthSettings) -> None:
    response.set_cookie(
        key=auth_settings.refresh_cookie_name,
        value=refresh_token,
        max_age=auth_settings.refresh_token_expire_minutes * SECONDS_PER_MINUTE,
        httponly=True,
        secure=auth_settings.refresh_cookie_secure,
        samesite=auth_settings.refresh_cookie_samesite,
        path=REFRESH_COOKIE_PATH,
    )


def clear_refresh_cookie(response: Response, auth_settings: AuthSettings) -> None:
    response.delete_cookie(
        key=auth_settings.refresh_cookie_name,
        httponly=True,
        secure=auth_settings.refresh_cookie_secure,
        samesite=auth_settings.refresh_cookie_samesite,
        path=REFRESH_COOKIE_PATH,
    )
