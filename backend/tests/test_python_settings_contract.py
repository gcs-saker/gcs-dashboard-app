from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from core.auth_config import AUTH_JWT_SECRET, AuthConfigError, AuthSettings
from core.db import DatabaseSettings
from core.ice_settings import WebRtcIceSettings
from core.settings_base import SettingsConfigurationError
from main import app
from modules.telemetry_buffer.sink import TelemetryBufferSettings

REPO_ROOT = Path(__file__).resolve().parents[2]
BACKEND_ENV_EXAMPLE = REPO_ROOT / "backend" / ".env.example"


def test_auth_settings_requires_secret(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv(AUTH_JWT_SECRET, raising=False)

    with pytest.raises(AuthConfigError, match=AUTH_JWT_SECRET):
        AuthSettings.from_env()


def test_auth_settings_masks_secret_in_repr() -> None:
    secret = "test-auth-secret-for-gcs-saker-at-least-32-characters"
    settings = AuthSettings(secret=secret)

    assert secret not in repr(settings)
    assert settings.secret.get_secret_value() == secret


def test_database_settings_rejects_wrong_legacy_flag_type(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("GCS_ALLOW_LEGACY_MYSQL", "definitely-not-bool")

    with pytest.raises(SettingsConfigurationError, match="database configuration error"):
        DatabaseSettings.from_env()


def test_ice_settings_uses_mediamtx_legacy_fallback(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("WEBRTC_TURN_URL", raising=False)
    monkeypatch.setenv("MEDIAMTX_TURN_URL", "turn:turn.internal:3478?transport=udp")
    monkeypatch.setenv("MEDIAMTX_TURN_USERNAME", "turn-user")
    monkeypatch.setenv("MEDIAMTX_TURN_PASSWORD", "turn-secret")

    settings = WebRtcIceSettings.from_env()

    assert settings.turn_url == "turn:turn.internal:3478?transport=udp"
    assert settings.browser_ice_servers()[1]["username"] == "turn-user"


def test_telemetry_buffer_settings_rejects_invalid_flush_size(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("TELEMETRY_BUFFER_AUTO_FLUSH_MAX_ITEMS", "0")

    with pytest.raises(SettingsConfigurationError, match="telemetry buffer configuration error"):
        TelemetryBufferSettings.from_env()


def test_app_startup_with_test_env_fixture() -> None:
    with TestClient(app) as client:
        response = client.get("/healthz")

    assert response.status_code == 200


def test_env_example_keeps_only_placeholders() -> None:
    content = BACKEND_ENV_EXAMPLE.read_text(encoding="utf-8")

    assert "change-me" in content
    assert "#2258703325" not in content
    assert "BEGIN PRIVATE KEY" not in content
