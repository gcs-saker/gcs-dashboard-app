import pytest

from core.db import DEFAULT_DATABASE_URL, LEGACY_MYSQL_ALLOWED_ENV, DatabaseSettings


def test_database_settings_uses_safe_default_without_env(monkeypatch) -> None:
    monkeypatch.delenv("DATABASE_URL", raising=False)

    settings = DatabaseSettings.from_env()

    assert settings.url == DEFAULT_DATABASE_URL
    assert "root:1234" not in settings.url


def test_database_settings_reads_database_url_from_env(monkeypatch) -> None:
    monkeypatch.setenv("DATABASE_URL", "postgresql+psycopg2://gcs_geo:test@postgres:5432/gcs_geo")

    settings = DatabaseSettings.from_env()

    assert settings.url == "postgresql+psycopg2://gcs_geo:test@postgres:5432/gcs_geo"
    assert settings.is_postgres is True


def test_database_settings_rejects_mysql_unless_legacy_flag_is_explicit(monkeypatch) -> None:
    monkeypatch.setenv("DATABASE_URL", "mysql+pymysql://legacy:test@mysql:3306/gcs")
    monkeypatch.delenv(LEGACY_MYSQL_ALLOWED_ENV, raising=False)

    with pytest.raises(ValueError, match="legacy fallback dialect"):
        DatabaseSettings.from_env()

    monkeypatch.setenv(LEGACY_MYSQL_ALLOWED_ENV, "true")

    settings = DatabaseSettings.from_env()

    assert settings.dialect == "mysql+pymysql"
