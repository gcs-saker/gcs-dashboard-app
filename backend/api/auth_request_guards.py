from __future__ import annotations

from urllib.parse import urlsplit

from fastapi import Request

from api.contracts import AuthErrorDetails, AuthProtocol
from api.errors import ForbiddenApiError
from config import WebSecuritySettings

ORIGIN_HEADER = "origin"
REFERER_HEADER = "referer"


def assert_trusted_request_origin(request: Request) -> None:
    request_origin = request.headers.get(ORIGIN_HEADER) or origin_from_referer(request.headers.get(REFERER_HEADER))
    if not request_origin:
        return

    allowed_origins = set(WebSecuritySettings.from_env().allowed_origins)
    if request_origin not in allowed_origins:
        raise ForbiddenApiError(AuthErrorDetails.UNTRUSTED_REQUEST_ORIGIN)


def assert_browser_csrf_header(request: Request) -> None:
    if not (request.headers.get(ORIGIN_HEADER) or request.headers.get(REFERER_HEADER)):
        return
    if request.headers.get(AuthProtocol.CSRF_HEADER_NAME) != AuthProtocol.CSRF_HEADER_VALUE:
        raise ForbiddenApiError(AuthErrorDetails.CSRF_HEADER_REQUIRED)


def origin_from_referer(referer: str | None) -> str | None:
    if not referer:
        return None
    parsed = urlsplit(referer)
    if not parsed.scheme or not parsed.netloc:
        return None
    return f"{parsed.scheme}://{parsed.netloc}"
