from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from core.db import get_db
from sql.mediate_sql import Gateway, UnmannedAsset, GatewayAsset
from core.security import get_current_user

from datetime import timedelta

router = APIRouter()
node_store = {}

@router.get("/{uuid}")
async def get_asset(uuid: str, db: Session = Depends(get_db)):
     # 1) gateway 찾기
    gateway = db.query(Gateway).filter(Gateway.uuid == uuid).first()
    if not gateway:
        raise HTTPException(status_code=404, detail="Gateway not found")

    # 2) 매핑 찾기
    mappings = db.query(GatewayAsset).filter(
        GatewayAsset.gateway_id == gateway.id
    ).all()
    asset_ids = [m.asset_id for m in mappings]
    if not asset_ids:
        return []

    # 3) 자산 목록 반환 (JSON 변환)
    assets = db.query(UnmannedAsset).filter(UnmannedAsset.id.in_(asset_ids)).all()
    
    print(assets)

    return assets
