from __future__ import annotations

from dataclasses import dataclass
import os

from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

Base = declarative_base()

DEFAULT_DATABASE_URL = "sqlite+pysqlite:///:memory:"


@dataclass(frozen=True)
class DatabaseSettings:
    url: str = DEFAULT_DATABASE_URL

    @classmethod
    def from_env(cls) -> "DatabaseSettings":
        return cls(url=os.getenv("DATABASE_URL", cls.url).strip() or cls.url)


def get_database_url() -> str:
    return DatabaseSettings.from_env().url


engine = create_engine(get_database_url(), pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
