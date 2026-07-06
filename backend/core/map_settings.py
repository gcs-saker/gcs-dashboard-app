from __future__ import annotations

from dataclasses import dataclass
import os

from core.env_parsing import empty_to_none, parse_bool

DEFAULT_MAP_PROVIDER = "esri-satellite"
DEFAULT_MAP_STYLE_URL = "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
DEFAULT_MAP_ATTRIBUTION = "Esri World Imagery"


@dataclass(frozen=True)
class DashboardMapSettings:
    provider: str = DEFAULT_MAP_PROVIDER
    style_url: str = DEFAULT_MAP_STYLE_URL
    attribution: str = DEFAULT_MAP_ATTRIBUTION
    requires_api_key: bool = False

    @classmethod
    def from_env(cls) -> "DashboardMapSettings":
        provider = empty_to_none(os.getenv("DASHBOARD_MAP_PROVIDER")) or DEFAULT_MAP_PROVIDER
        return cls(
            provider=provider if provider in {"esri-satellite", "openfreemap", "offline", "custom"} else "custom",
            style_url=empty_to_none(os.getenv("DASHBOARD_MAP_STYLE_URL")) or DEFAULT_MAP_STYLE_URL,
            attribution=empty_to_none(os.getenv("DASHBOARD_MAP_ATTRIBUTION")) or DEFAULT_MAP_ATTRIBUTION,
            requires_api_key=parse_bool(os.getenv("DASHBOARD_MAP_REQUIRES_API_KEY"), default=False),
        )
