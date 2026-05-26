from __future__ import annotations

from typing import Annotated, cast

from fastapi import APIRouter, Depends, HTTPException, status
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from core.db import get_db
from core.security import (
    AuthConfigError,
    AuthSettings,
    AuthenticatedUser,
    create_access_token,
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


@router.post("/signup", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def signup(user: UserCreate, db: Annotated[Session, Depends(get_db)]) -> User:
    db_user = db.query(User).filter(User.username == user.username).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Username already registered")

    db_email = db.query(User).filter(User.email == user.email).first()
    if db_email:
        raise HTTPException(status_code=400, detail="Email already registered")

    db_company = db.query(Company).filter(Company.invite_code == user.inviteCode).first()
    if not db_company:
        raise HTTPException(status_code=400, detail="Invalid invite code Input")

    new_user = User(
        username=user.username,
        email=user.email,
        password_hash=get_password_hash(user.password),
        company_id=db_company.id,
        role=normalize_role(user.role),
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user


@router.post("/login", response_model=TokenResponse)
def login(user: UserLogin, db: Annotated[Session, Depends(get_db)]) -> TokenResponse:
    db_user = db.query(User).filter(User.username == user.username).first()
    if not db_user or not verify_password(user.password, cast(str, db_user.password_hash)):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    try:
        auth_settings = AuthSettings.from_env()
        token = create_access_token(
            cast(str, db_user.username),
            cast(str | None, db_user.role),
            settings=auth_settings,
        )
    except AuthConfigError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc

    return TokenResponse(
        access_token=token,
        token_type="bearer",
        expires_in_minutes=auth_settings.access_token_expire_minutes,
        username=cast(str, db_user.username),
        role=normalize_role(cast(str | None, db_user.role)),
    )


@router.get("/me", response_model=AuthenticatedUserResponse)
def read_current_user(current_user: Annotated[AuthenticatedUser, Depends(get_current_user)]):
    return AuthenticatedUserResponse(username=current_user.username, role=current_user.role)
