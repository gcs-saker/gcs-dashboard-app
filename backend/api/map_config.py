from typing import Annotated

from fastapi import APIRouter, Depends

from api.contracts import MapRoutes
from modules.map_config import MapConfigResponse, MapConfigService

router = APIRouter()
map_config_service = MapConfigService()


def get_map_config_service() -> MapConfigService:
    return map_config_service


MapConfigServiceDependency = Annotated[
    MapConfigService,
    Depends(get_map_config_service),
]


@router.get(MapRoutes.CONFIG, response_model=MapConfigResponse)
async def get_map_config(service: MapConfigServiceDependency) -> MapConfigResponse:
    return service.get_config()
