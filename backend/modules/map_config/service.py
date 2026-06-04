from typing import cast

from config import DashboardMapSettings
from modules.map_config.schemas import MapConfigResponse, MapProvider


class MapConfigService:
    def __init__(self, settings: DashboardMapSettings | None = None) -> None:
        self.settings = settings or DashboardMapSettings.from_env()

    def get_config(self) -> MapConfigResponse:
        return MapConfigResponse(
            provider=self._provider(),
            styleUrl=self.settings.style_url,
            attribution=self.settings.attribution,
            requiresApiKey=self.settings.requires_api_key,
        )

    def _provider(self) -> MapProvider:
        if self.settings.provider in {"openfreemap", "offline", "custom"}:
            return cast(MapProvider, self.settings.provider)
        return "custom"
