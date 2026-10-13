from pathlib import Path

import pytest

from core.media_settings import MEDIAMTX_API_PASSWORD, MEDIAMTX_API_PASSWORD_FILE, MediaServerSettings
from core.settings_base import SettingsConfigurationError


def test_media_settings_reads_password_file_and_rejects_ambiguous_input(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    secret_file = tmp_path / "mediamtx-password"
    secret_file.write_text("media-secret\n", encoding="utf-8")
    monkeypatch.delenv(MEDIAMTX_API_PASSWORD, raising=False)
    monkeypatch.setenv(MEDIAMTX_API_PASSWORD_FILE, str(secret_file))

    assert MediaServerSettings.from_env().api_password == "media-secret"
    monkeypatch.setenv(MEDIAMTX_API_PASSWORD, "environment-secret")
    with pytest.raises(SettingsConfigurationError, match="cannot both be configured"):
        MediaServerSettings.from_env()
