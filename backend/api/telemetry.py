from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.orm import Session

from api.contracts import TelemetryRoutes
from core.db import get_db
from core.security import AuthenticatedUser, get_current_user
from model.telemetry_model import TelemetryCreate, TelemetryResponse
from modules.telemetry_ingest import (
    TelemetryIngestCommand,
    TelemetryReadModelStore,
    format_epoch,
    format_epoch_millis,
    upsert_telemetry,
)

router = APIRouter()


def get_telemetry_read_model_store(request: Request) -> TelemetryReadModelStore:
    return request.app.state.telemetry_read_model_store


TelemetryReadModelDependency = Annotated[TelemetryReadModelStore, Depends(get_telemetry_read_model_store)]


# 센서 데이터 수집 (장비 → 서버)
@router.post(TelemetryRoutes.INGEST, response_model=TelemetryResponse)
async def receive_telemetry(
    data: TelemetryCreate,
    read_models: TelemetryReadModelDependency,
    db: Session = Depends(get_db),
):
    command = TelemetryIngestCommand.from_create(data)
    read_models.upsert(command)
    return upsert_telemetry(command, db)


# 로그인 사용자만 접근 가능
@router.get(TelemetryRoutes.ALL, response_model=list[TelemetryResponse])
async def get_all_telemetry(
    read_models: TelemetryReadModelDependency,
    current_user: AuthenticatedUser = Depends(get_current_user),
    limit: int = Query(200, ge=1, le=500),
    offset: int = Query(0, ge=0, le=100_000),
):
    return read_models.list(limit, offset)


__all__ = [
    "TelemetryIngestCommand",
    "format_epoch",
    "format_epoch_millis",
    "router",
    "upsert_telemetry",
]
