from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy.dialects.mysql import insert as mysql_insert
from sqlalchemy.orm import Session

from api.contracts import TelemetryRoutes
from core.db import get_db
from core.security import AuthenticatedUser, get_current_user
from model.telemetry_model import TelemetryCreate, TelemetryResponse
from sql.telemetry_sql import Telemetry

router = APIRouter()
node_store: dict[str | None, dict[str, Any]] = {}

# 센서 데이터 수집 (장비 → 서버)
@router.post(TelemetryRoutes.INGEST, response_model=TelemetryResponse)
async def receive_telemetry(data: TelemetryCreate, db: Session = Depends(get_db)):
    node: dict[str, Any] = data.model_dump()

    # epochTime 변환 (ms → hh:mm:ss)
    if node.get("epochTime") is not None:
        seconds = int(node["epochTime"] / 1000)
        h = seconds // 3600
        m = (seconds % 3600) // 60
        s = seconds % 60
        node["epochTime"] = f"{h:02}:{m:02}:{s:02}"
        
    # 메모리 저장
    node_store[data.uuid] = node

    return upsert_telemetry(data, db)


def upsert_telemetry(data: TelemetryCreate, db: Session) -> Any:
    if _is_mysql_session(db):
        payload: dict[str, Any] = data.model_dump(exclude_unset=True)
        _upsert_mysql_telemetry(db, payload)
        db.commit()
        db_obj = db.query(Telemetry).filter(Telemetry.uuid == data.uuid).first()
        return db_obj

    db_obj = db.query(Telemetry).filter(Telemetry.uuid == data.uuid).first()
    if db_obj:
        for key, value in data.model_dump(exclude_unset=True).items():
            setattr(db_obj, key, value)
    else:
        insert_payload: dict[str, Any] = data.model_dump()

        db_obj = Telemetry(**insert_payload)
        db.add(db_obj)
    db.commit()
    db.refresh(db_obj)

    return db_obj   # ✅ TelemetryResponse로 자동 변환


# 로그인 사용자만 접근 가능
@router.get(TelemetryRoutes.ALL, response_model=list[TelemetryResponse])
async def get_all_telemetry(current_user: AuthenticatedUser = Depends(get_current_user)):
    telemetry = []
    for n in node_store.values():
        n["epochTime"] = format_epoch(n["epochTime"])
        telemetry.append(n)
    return telemetry

def format_epoch(epoch_val):
    try:
        sec = int(epoch_val)
        h, m, s = sec // 3600, (sec % 3600) // 60, sec % 60
        return f"{h:02}:{m:02}:{s:02}"
    except Exception:
        return str(epoch_val)


def _is_mysql_session(db: Session) -> bool:
    return db.get_bind().dialect.name in {"mysql", "mariadb"}


def _upsert_mysql_telemetry(db: Session, payload: dict[str, Any]) -> None:
    db.execute(_build_mysql_telemetry_upsert(payload))


def _build_mysql_telemetry_upsert(payload: dict[str, Any]) -> Any:
    insert_statement = mysql_insert(Telemetry).values(**payload)
    update_columns = {
        column_name: getattr(insert_statement.inserted, column_name)
        for column_name in payload
        if column_name != "uuid"
    }
    return insert_statement.on_duplicate_key_update(**update_columns)

