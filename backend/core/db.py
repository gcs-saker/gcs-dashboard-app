from __future__ import annotations

from urllib.parse import urlparse

from pydantic import Field, ValidationError, model_validator
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

from core.settings_base import BackendBaseSettings, SettingsConfigurationError, settings_error_message

Base = declarative_base()

DATABASE_URL_ENV = "DATABASE_URL"
DEFAULT_DATABASE_URL = "sqlite+pysqlite:///:memory:"
LEGACY_MYSQL_ALLOWED_ENV = "GCS_ALLOW_LEGACY_MYSQL"
LEGACY_MYSQL_DIALECTS = frozenset({"mysql", "mysql+pymysql", "mariadb", "mariadb+pymysql"})
POSTGRES_DIALECTS = frozenset({"postgresql", "postgresql+psycopg2"})


class DatabaseSettings(BackendBaseSettings):
    url: str = Field(DEFAULT_DATABASE_URL, validation_alias=DATABASE_URL_ENV)
    legacy_mysql_allowed: bool = Field(False, validation_alias=LEGACY_MYSQL_ALLOWED_ENV)

    @classmethod
    def from_env(cls) -> "DatabaseSettings":
        try:
            return cls()
        except ValidationError as exc:
            raise SettingsConfigurationError(settings_error_message("database", exc)) from exc

    @property
    def dialect(self) -> str:
        return urlparse(self.url).scheme

    @property
    def is_postgres(self) -> bool:
        return self.dialect in POSTGRES_DIALECTS

    @model_validator(mode="after")
    def validate_dialect(self) -> "DatabaseSettings":
        if self.dialect in LEGACY_MYSQL_DIALECTS and not legacy_mysql_allowed():
            raise ValueError(
                f"{self.dialect} is a legacy fallback dialect. "
                f"Use PostgreSQL/PostGIS or set {LEGACY_MYSQL_ALLOWED_ENV}=true for an explicit migration-only run."
            )
        return self


class LegacyMysqlPolicySettings(BackendBaseSettings):
    allowed: bool = Field(False, validation_alias=LEGACY_MYSQL_ALLOWED_ENV)


def legacy_mysql_allowed() -> bool:
    return LegacyMysqlPolicySettings().allowed


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
