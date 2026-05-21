from pydantic import BaseModel, ConfigDict
from typing import Optional
# -----------------------------
# 모델 정의
# -----------------------------
class TelemetryCreate(BaseModel):
    uuid: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    altitude: Optional[float] = None
    magneticX: Optional[float] = None
    magneticY: Optional[float] = None
    magneticZ: Optional[float] = None
    soc: Optional[str] = None
    phoneBatterySOC: Optional[float] = None
    velocity: Optional[float] = None
    totalDistance: Optional[float] = None
    epochTime: Optional[int] = None
    portDistance: Optional[float] = None
    
class TelemetryResponse(BaseModel):
    uuid: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    altitude: Optional[float] = None
    magneticX: Optional[float] = None
    magneticY: Optional[float] = None
    magneticZ: Optional[float] = None
    soc: Optional[str] = None
    phoneBatterySOC: Optional[float] = None
    velocity: Optional[float] = None
    totalDistance: Optional[float] = None
    epochTime: Optional[str] = None   # ✅ int → str 로 수정
    portDistance: Optional[float] = None
    
    model_config = ConfigDict(from_attributes=True)