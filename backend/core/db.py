from __future__ import annotations

from dataclasses import dataclass
import os
from urllib.parse import urlparse

from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

Base = declarative_base()

DEFAULT_DATABASE_URL = "sqlite+pysqlite:///:memory:"
LEGACY_MYSQL_ALLOWED_ENV = "GCS_ALLOW_LEGACY_MYSQL"
LEGACY_MYSQL_DIALECTS = frozenset({"mysql", "mysql+pymysql", "mariadb", "mariadb+pymysql"})
POSTGRES_DIALECTS = frozenset({"postgresql", "postgresql+psycopg2"})


@dataclass(frozen=True)
class DatabaseSettings:
    url: str = DEFAULT_DATABASE_URL

    @classmethod
    def from_env(cls) -> "DatabaseSettings":
        settings = cls(url=os.getenv("DATABASE_URL", cls.url).strip() or cls.url)
        settings.validate()
        return settings

    @property
    def dialect(self) -> str:
        return urlparse(self.url).scheme

    @property
    def is_postgres(self) -> bool:
        return self.dialect in POSTGRES_DIALECTS

    def validate(self) -> None:
        if self.dialect in LEGACY_MYSQL_DIALECTS and not legacy_mysql_allowed():
            raise ValueError(
                f"{self.dialect} is a legacy fallback dialect. "
                f"Use PostgreSQL/PostGIS or set {LEGACY_MYSQL_ALLOWED_ENV}=true for an explicit migration-only run."
            )


def legacy_mysql_allowed() -> bool:
    return os.getenv(LEGACY_MYSQL_ALLOWED_ENV, "").strip().lower() in {"1", "true", "yes", "on"}


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
