from typing import Annotated, cast

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from api.contracts import AssetErrorDetails, AssetRoutes
from api.errors import NotFoundApiError
from core.db import get_db
from sql.mediate_sql import Gateway, GatewayAsset, UnmannedAsset

router = APIRouter()
PageLimit = Annotated[int, Query(ge=1, le=500)]
PageOffset = Annotated[int, Query(ge=0, le=100_000)]


@router.get(AssetRoutes.BY_GATEWAY_UUID)
async def get_asset(
    uuid: str,
    db: Session = Depends(get_db),
    limit: PageLimit = 200,
    offset: PageOffset = 0,
):
    gateway_id = cast(int | None, db.query(Gateway.id).filter(Gateway.uuid == uuid).scalar())
    if gateway_id is None:
        raise NotFoundApiError(AssetErrorDetails.GATEWAY_NOT_FOUND)

    # gateway 존재 확인 뒤 join으로 mapping + asset 조회를 한 번에 처리한다.
    assets = (
        db.query(UnmannedAsset)
        .join(GatewayAsset, GatewayAsset.asset_id == UnmannedAsset.id)
        .filter(GatewayAsset.gateway_id == gateway_id)
        .order_by(UnmannedAsset.id)
        .limit(limit)
        .offset(offset)
        .all()
    )

    return assets
