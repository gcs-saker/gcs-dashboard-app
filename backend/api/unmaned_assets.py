from typing import cast

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from api.contracts import AssetErrorDetails, AssetRoutes
from api.errors import NotFoundApiError
from core.db import get_db
from sql.mediate_sql import Gateway, GatewayAsset, UnmannedAsset

router = APIRouter()


@router.get(AssetRoutes.BY_GATEWAY_UUID)
async def get_asset(uuid: str, db: Session = Depends(get_db)):
    gateway_id = cast(int | None, db.query(Gateway.id).filter(Gateway.uuid == uuid).scalar())
    if gateway_id is None:
        raise NotFoundApiError(AssetErrorDetails.GATEWAY_NOT_FOUND)

    # gateway 존재 확인 뒤 join으로 mapping + asset 조회를 한 번에 처리한다.
    assets = (
        db.query(UnmannedAsset)
        .join(GatewayAsset, GatewayAsset.asset_id == UnmannedAsset.id)
        .filter(GatewayAsset.gateway_id == gateway_id)
        .all()
    )

    return assets
