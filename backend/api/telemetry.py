from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from api.contracts import TelemetryRoutes
from core.db import get_db
from core.security import AuthenticatedUser, get_current_user
from model.telemetry_model import TelemetryCreate, TelemetryResponse
from modules.telemetry_ingest import (
    TelemetryIngestCommand,
    default_read_model_store,
    format_epoch,
    format_epoch_millis,
    upsert_telemetry,
)

router = APIRouter()


# 센서 데이터 수집 (장비 → 서버)
@router.post(TelemetryRoutes.INGEST, response_model=TelemetryResponse)
async def receive_telemetry(data: TelemetryCreate, db: Session = Depends(get_db)):
    command = TelemetryIngestCommand.from_create(data)
    default_read_model_store.upsert(command)
    return upsert_telemetry(command, db)


# 로그인 사용자만 접근 가능
@router.get(TelemetryRoutes.ALL, response_model=list[TelemetryResponse])
async def get_all_telemetry(current_user: AuthenticatedUser = Depends(get_current_user)):
    return default_read_model_store.list()


__all__ = [
    "TelemetryIngestCommand",
    "format_epoch",
    "format_epoch_millis",
    "router",
    "upsert_telemetry",
]
