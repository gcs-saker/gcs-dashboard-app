from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

MapProvider = Literal["openfreemap", "offline", "custom"]


class MapConfigResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    provider: MapProvider
    style_url: str = Field(alias="styleUrl")
    attribution: str
    requires_api_key: bool = Field(alias="requiresApiKey")
