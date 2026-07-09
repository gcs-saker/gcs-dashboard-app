from typing import cast

from config import DashboardMapSettings
from modules.map_config.schemas import MapConfigResponse, MapProvider


class MapConfigService:
    def __init__(self, settings: DashboardMapSettings | None = None) -> None:
        self.settings = settings or DashboardMapSettings.from_env()

    def get_config(self) -> MapConfigResponse:
        return MapConfigResponse(
            provider=self._provider(),
            style_url=self.settings.style_url,
            attribution=self.settings.attribution,
            requires_api_key=self.settings.requires_api_key,
        )

    def _provider(self) -> MapProvider:
        if self.settings.provider in {"esri-satellite", "openfreemap", "offline", "custom"}:
            return cast(MapProvider, self.settings.provider)
        return "custom"
