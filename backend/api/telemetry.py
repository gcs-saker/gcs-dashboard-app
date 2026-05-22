from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from core.db import get_db
from model.telemetry_model import TelemetryCreate, TelemetryResponse
from sql.telemetry_sql import Telemetry
from core.security import get_current_user

from datetime import timedelta


router = APIRouter()
node_store: dict[str | None, dict[str, Any]] = {}

# 센서 데이터 수집 (장비 → 서버)
@router.post("/", response_model=TelemetryResponse)
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

    # DB upsert
    db_obj = db.query(Telemetry).filter(Telemetry.uuid == data.uuid).first()
    if db_obj:
        for key, value in data.model_dump(exclude_unset=True).items():
            setattr(db_obj, key, value)
    else:
        payload: dict[str, Any] = data.model_dump()

        # ✅ epochTime이 숫자면 문자열(HH:MM:SS)로 변환
        if isinstance(payload.get("epochTime"), (int, float)):
            seconds = int(payload["epochTime"])
            hours_text, minutes_text, seconds_text = str(timedelta(seconds=seconds)).split(":")
            payload["epochTime"] = f"{int(hours_text):02}:{int(minutes_text):02}:{int(float(seconds_text)):02}"

        db_obj = Telemetry(**payload)
        db.add(db_obj)
    db.commit()
    db.refresh(db_obj)

    print(node)
    return db_obj   # ✅ TelemetryResponse로 자동 변환


# 로그인 사용자만 접근 가능
@router.get("/all", response_model=list[TelemetryResponse])
async def get_all_telemetry(current_user: dict = Depends(get_current_user)):
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

