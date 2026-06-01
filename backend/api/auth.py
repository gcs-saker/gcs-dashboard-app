from __future__ import annotations

from typing import Annotated, cast
from urllib.parse import urlsplit

from fastapi import APIRouter, Depends, Request, Response, status
from fastapi.responses import JSONResponse
from passlib.context import CryptContext
from sqlalchemy import exists
from sqlalchemy.orm import Session

from api.contracts import AuthErrorDetails, AuthProtocol, AuthRoutes
from api.errors import BadRequestApiError, ForbiddenApiError, ServiceUnavailableApiError, UnauthorizedApiError
from config import WebSecuritySettings
from core.db import get_db
from core.security import (
    AuthConfigError,
    AuthSettings,
    AuthenticatedUser,
    create_access_token,
    create_refresh_token,
    decode_refresh_token,
    get_current_user,
    normalize_role,
)
from model.user_model import AuthenticatedUserResponse, TokenResponse, UserCreate, UserLogin, UserResponse
from sql.company_sql import Company
from sql.user_sql import User

router = APIRouter()

pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")


def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


@router.post(AuthRoutes.SIGNUP, response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def signup(user: UserCreate, request: Request, db: Annotated[Session, Depends(get_db)]) -> User:
    _assert_trusted_request_origin(request)
    _assert_browser_csrf_header(request)
    username_exists, email_exists = db.query(
        exists().where(User.username == user.username).label("username_exists"),
        exists().where(User.email == user.email).label("email_exists"),
    ).one()
    if username_exists:
        raise BadRequestApiError(AuthErrorDetails.USERNAME_ALREADY_REGISTERED)
    if email_exists:
        raise BadRequestApiError(AuthErrorDetails.EMAIL_ALREADY_REGISTERED)

    company_id = cast(
        int | None,
        db.query(Company.id).filter(Company.invite_code == user.inviteCode).scalar(),
    )
    if company_id is None:
        raise BadRequestApiError(AuthErrorDetails.INVALID_INVITE_CODE)

    new_user = User(
        username=user.username,
        email=user.email,
        password_hash=get_password_hash(user.password),
        company_id=company_id,
        role=normalize_role(user.role),
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user


@router.post(AuthRoutes.LOGIN, response_model=TokenResponse)
def login(
    user: UserLogin,
    request: Request,
    response: Response,
    db: Annotated[Session, Depends(get_db)],
) -> TokenResponse:
    _assert_trusted_request_origin(request)
    _assert_browser_csrf_header(request)
    db_user = (
        db.query(User.username, User.password_hash, User.role)
        .filter(User.username == user.username)
        .first()
    )
    if not db_user or not verify_password(user.password, cast(str, db_user.password_hash)):
        raise UnauthorizedApiError(AuthErrorDetails.INVALID_CREDENTIALS)

    try:
        auth_settings = AuthSettings.from_env()
        token = create_access_token(
            cast(str, db_user.username),
            cast(str | None, db_user.role),
            settings=auth_settings,
        )
        refresh_token = create_refresh_token(
            cast(str, db_user.username),
            cast(str | None, db_user.role),
            settings=auth_settings,
        )
    except AuthConfigError as exc:
        raise ServiceUnavailableApiError(str(exc)) from exc

    _set_refresh_cookie(response, refresh_token, auth_settings)
    return TokenResponse(
        access_token=token,
        token_type=AuthProtocol.BEARER_TOKEN_TYPE,
        expires_in_minutes=auth_settings.access_token_expire_minutes,
        username=cast(str, db_user.username),
        role=normalize_role(cast(str | None, db_user.role)),
    )


@router.post(AuthRoutes.REFRESH, response_model=TokenResponse)
def refresh_session(request: Request, response: Response, db: Annotated[Session, Depends(get_db)]) -> TokenResponse | JSONResponse:
    _assert_trusted_request_origin(request)
    _assert_browser_csrf_header(request)
    try:
        auth_settings = AuthSettings.from_env()
    except AuthConfigError as exc:
        raise ServiceUnavailableApiError(str(exc)) from exc

    refresh_token = request.cookies.get(auth_settings.refresh_cookie_name)
    if not refresh_token:
        raise UnauthorizedApiError(AuthErrorDetails.REFRESH_TOKEN_REQUIRED)

    refresh_user = decode_refresh_token(refresh_token, settings=auth_settings)
    db_user = db.query(User.role).filter(User.username == refresh_user.username).first()
    if not db_user:
        error_response = JSONResponse(
            status_code=status.HTTP_401_UNAUTHORIZED,
            content={"detail": AuthErrorDetails.INVALID_REFRESH_SESSION},
        )
        _clear_refresh_cookie(error_response, auth_settings)
        return error_response

    access_token = create_access_token(
        refresh_user.username,
        cast(str | None, db_user.role),
        settings=auth_settings,
    )
    rotated_refresh_token = create_refresh_token(
        refresh_user.username,
        cast(str | None, db_user.role),
        settings=auth_settings,
    )
    _set_refresh_cookie(response, rotated_refresh_token, auth_settings)
    return TokenResponse(
        access_token=access_token,
        token_type=AuthProtocol.BEARER_TOKEN_TYPE,
        expires_in_minutes=auth_settings.access_token_expire_minutes,
        username=refresh_user.username,
        role=normalize_role(cast(str | None, db_user.role)),
    )


@router.post(AuthRoutes.LOGOUT, status_code=status.HTTP_204_NO_CONTENT)
def logout(request: Request, response: Response) -> Response:
    _assert_trusted_request_origin(request)
    _assert_browser_csrf_header(request)
    try:
        auth_settings = AuthSettings.from_env()
    except AuthConfigError as exc:
        raise ServiceUnavailableApiError(str(exc)) from exc
    _clear_refresh_cookie(response, auth_settings)
    response.status_code = status.HTTP_204_NO_CONTENT
    return response


@router.get(AuthRoutes.ME, response_model=AuthenticatedUserResponse)
def read_current_user(current_user: Annotated[AuthenticatedUser, Depends(get_current_user)]):
    return AuthenticatedUserResponse(username=current_user.username, role=current_user.role)


def _set_refresh_cookie(response: Response, refresh_token: str, auth_settings: AuthSettings) -> None:
    response.set_cookie(
        key=auth_settings.refresh_cookie_name,
        value=refresh_token,
        max_age=auth_settings.refresh_token_expire_minutes * 60,
        httponly=True,
        secure=auth_settings.refresh_cookie_secure,
        samesite=auth_settings.refresh_cookie_samesite,
        path="/",
    )


def _clear_refresh_cookie(response: Response, auth_settings: AuthSettings) -> None:
    response.delete_cookie(
        key=auth_settings.refresh_cookie_name,
        httponly=True,
        secure=auth_settings.refresh_cookie_secure,
        samesite=auth_settings.refresh_cookie_samesite,
        path="/",
    )


def _assert_trusted_request_origin(request: Request) -> None:
    request_origin = request.headers.get("origin") or _origin_from_referer(request.headers.get("referer"))
    if not request_origin:
        return

    allowed_origins = set(WebSecuritySettings.from_env().allowed_origins)
    if request_origin not in allowed_origins:
        raise ForbiddenApiError(AuthErrorDetails.UNTRUSTED_REQUEST_ORIGIN)


def _assert_browser_csrf_header(request: Request) -> None:
    if not (request.headers.get("origin") or request.headers.get("referer")):
        return
    if request.headers.get(AuthProtocol.CSRF_HEADER_NAME) != AuthProtocol.CSRF_HEADER_VALUE:
        raise ForbiddenApiError(AuthErrorDetails.CSRF_HEADER_REQUIRED)


def _origin_from_referer(referer: str | None) -> str | None:
    if not referer:
        return None
    parsed = urlsplit(referer)
    if not parsed.scheme or not parsed.netloc:
        return None
    return f"{parsed.scheme}://{parsed.netloc}"
