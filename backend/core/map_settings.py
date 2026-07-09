from __future__ import annotations

from pydantic import Field, ValidationError, field_validator

from core.env_parsing import empty_to_none
from core.settings_base import BackendBaseSettings, SettingsConfigurationError, settings_error_message

DEFAULT_MAP_PROVIDER = "esri-satellite"
DEFAULT_MAP_STYLE_URL = (
    "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
)
DEFAULT_MAP_ATTRIBUTION = "Esri World Imagery"


class DashboardMapSettings(BackendBaseSettings):
    provider: str = Field(DEFAULT_MAP_PROVIDER, validation_alias="DASHBOARD_MAP_PROVIDER")
    style_url: str = Field(DEFAULT_MAP_STYLE_URL, validation_alias="DASHBOARD_MAP_STYLE_URL")
    attribution: str = Field(DEFAULT_MAP_ATTRIBUTION, validation_alias="DASHBOARD_MAP_ATTRIBUTION")
    requires_api_key: bool = Field(False, validation_alias="DASHBOARD_MAP_REQUIRES_API_KEY")

    @field_validator("provider", mode="before")
    @classmethod
    def normalize_provider(cls, value: object) -> object:
        provider = empty_to_none(value) if isinstance(value, str) else value
        if provider is None:
            return DEFAULT_MAP_PROVIDER
        return provider if provider in {"esri-satellite", "openfreemap", "offline", "custom"} else "custom"

    @field_validator("style_url", mode="before")
    @classmethod
    def default_style_url(cls, value: object) -> object:
        if isinstance(value, str):
            return empty_to_none(value) or DEFAULT_MAP_STYLE_URL
        return value

    @field_validator("attribution", mode="before")
    @classmethod
    def default_attribution(cls, value: object) -> object:
        if isinstance(value, str):
            return empty_to_none(value) or DEFAULT_MAP_ATTRIBUTION
        return value

    @classmethod
    def from_env(cls) -> "DashboardMapSettings":
        try:
            settings = cls()
        except ValidationError as exc:
            raise SettingsConfigurationError(settings_error_message("dashboard map", exc)) from exc
        return settings
