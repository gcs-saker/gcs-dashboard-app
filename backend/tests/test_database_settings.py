from core.db import DEFAULT_DATABASE_URL, DatabaseSettings


def test_database_settings_uses_safe_default_without_env(monkeypatch) -> None:
    monkeypatch.delenv("DATABASE_URL", raising=False)

    settings = DatabaseSettings.from_env()

    assert settings.url == DEFAULT_DATABASE_URL
    assert "root:1234" not in settings.url


def test_database_settings_reads_database_url_from_env(monkeypatch) -> None:
    monkeypatch.setenv("DATABASE_URL", "mysql+pymysql://gcs_app:test@mysql:3306/gcs_db")

    settings = DatabaseSettings.from_env()

    assert settings.url == "mysql+pymysql://gcs_app:test@mysql:3306/gcs_db"
