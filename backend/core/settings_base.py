from __future__ import annotations

from typing import Any, TypeVar

from pydantic import ValidationError
from pydantic_settings import BaseSettings, SettingsConfigDict


class SettingsConfigurationError(RuntimeError):
    pass


class BackendBaseSettings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
        populate_by_name=True,
    )


SettingsT = TypeVar("SettingsT", bound=BackendBaseSettings)


def load_settings(settings_type: type[SettingsT], *, label: str) -> SettingsT:
    try:
        return settings_type()
    except ValidationError as exc:
        raise SettingsConfigurationError(settings_error_message(label, exc)) from exc


def settings_error_message(label: str, exc: ValidationError) -> str:
    first_error: dict[str, Any] = dict(exc.errors()[0])
    location = ".".join(str(item) for item in first_error.get("loc", ("settings",)))
    message = str(first_error.get("msg", "invalid setting"))
    return f"{label} configuration error at {location}: {message}"
