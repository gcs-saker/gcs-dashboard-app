#!/usr/bin/env python3
"""Create an idempotent smoke user for authenticated M7 browser checks."""

from __future__ import annotations

import os

from api.auth import get_password_hash
from core.db import Base, SessionLocal, engine
from core.security import normalize_role
from sql.company_sql import Company
from sql.user_sql import User


def env(name: str, fallback: str) -> str:
    return os.getenv(name, fallback).strip() or fallback


def main() -> int:
    username = env("SMOKE_USERNAME", "m7-smoke-viewer")
    password = env("SMOKE_PASSWORD", "m7-smoke-pass")
    email = env("SMOKE_EMAIL", "m7-smoke-viewer@example.test")
    invite_code = env("SMOKE_INVITE_CODE", "A4AI01")
    role = normalize_role(env("SMOKE_ROLE", "viewer"))

    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        company = db.query(Company).filter(Company.invite_code == invite_code).first()
        if company is None:
            company = Company(companyname="A4AI Smoke Test", invite_code=invite_code)
            db.add(company)
            db.flush()

        user = db.query(User).filter(User.username == username).first()
        if user is None:
            user = User(
                username=username,
                email=email,
                password_hash=get_password_hash(password),
                company_id=company.id,
                role=role,
            )
            db.add(user)
            action = "created"
        else:
            user.email = email
            user.password_hash = get_password_hash(password)
            user.company_id = company.id
            user.role = role
            action = "updated"

        db.commit()
        print(
            f"Smoke user {action}: username={username} role={role} inviteCode={invite_code}"
        )
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
