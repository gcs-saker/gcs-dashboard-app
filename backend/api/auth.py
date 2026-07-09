from __future__ import annotations

from typing import Annotated, cast

from fastapi import APIRouter, Depends, Request, Response, status
from fastapi.responses import JSONResponse
from sqlalchemy import exists
from sqlalchemy.orm import Session

from api.auth_cookies import clear_refresh_cookie, set_refresh_cookie
from api.auth_passwords import get_password_hash, verify_password
from api.auth_request_guards import assert_browser_csrf_header, assert_trusted_request_origin
from api.auth_token_responses import create_login_token_response, create_refreshed_token_response, load_auth_settings
from api.contracts import AuthErrorDetails, AuthRoutes
from api.errors import BadRequestApiError, UnauthorizedApiError
from core.db import get_db
from core.security import (
    AuthenticatedUser,
    decode_refresh_token,
    get_current_user,
    normalize_role,
)
from model.user_model import AuthenticatedUserResponse, TokenResponse, UserCreate, UserLogin, UserResponse
from sql.company_sql import Company
from sql.user_sql import User

router = APIRouter()


@router.post(AuthRoutes.SIGNUP, response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def signup(user: UserCreate, request: Request, db: Annotated[Session, Depends(get_db)]) -> User:
    assert_trusted_request_origin(request)
    assert_browser_csrf_header(request)
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
    assert_trusted_request_origin(request)
    assert_browser_csrf_header(request)
    db_user = db.query(User.username, User.password_hash, User.role).filter(User.username == user.username).first()
    if not db_user or not verify_password(user.password, cast(str, db_user.password_hash)):
        raise UnauthorizedApiError(AuthErrorDetails.INVALID_CREDENTIALS)

    auth_settings = load_auth_settings()
    token_response, refresh_token = create_login_token_response(
        cast(str, db_user.username),
        cast(str | None, db_user.role),
        auth_settings,
    )
    set_refresh_cookie(response, refresh_token, auth_settings)
    return token_response


@router.post(AuthRoutes.REFRESH, response_model=TokenResponse)
def refresh_session(
    request: Request, response: Response, db: Annotated[Session, Depends(get_db)]
) -> TokenResponse | JSONResponse:
    assert_trusted_request_origin(request)
    assert_browser_csrf_header(request)
    auth_settings = load_auth_settings()

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
        clear_refresh_cookie(error_response, auth_settings)
        return error_response

    token_response, rotated_refresh_token = create_refreshed_token_response(
        refresh_user.username,
        cast(str | None, db_user.role),
        auth_settings,
    )
    set_refresh_cookie(response, rotated_refresh_token, auth_settings)
    return token_response


@router.post(AuthRoutes.LOGOUT, status_code=status.HTTP_204_NO_CONTENT)
def logout(request: Request, response: Response) -> Response:
    assert_trusted_request_origin(request)
    assert_browser_csrf_header(request)
    auth_settings = load_auth_settings()
    clear_refresh_cookie(response, auth_settings)
    response.status_code = status.HTTP_204_NO_CONTENT
    return response


@router.get(AuthRoutes.ME, response_model=AuthenticatedUserResponse)
def read_current_user(current_user: Annotated[AuthenticatedUser, Depends(get_current_user)]):
    return AuthenticatedUserResponse(username=current_user.username, role=current_user.role)
