from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


# -----------------------------
# 모델 정의
# -----------------------------
class TelemetryCreate(BaseModel):
    uuid: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    altitude: Optional[float] = None
    magnetic_x: Optional[float] = Field(default=None, alias="magneticX")
    magnetic_y: Optional[float] = Field(default=None, alias="magneticY")
    magnetic_z: Optional[float] = Field(default=None, alias="magneticZ")
    soc: Optional[str] = None
    phone_battery_soc: Optional[float] = Field(default=None, alias="phoneBatterySOC")
    velocity: Optional[float] = None
    total_distance: Optional[float] = Field(default=None, alias="totalDistance")
    epoch_time: Optional[int] = Field(default=None, alias="epochTime")
    port_distance: Optional[float] = Field(default=None, alias="portDistance")

    model_config = ConfigDict(populate_by_name=True)


class TelemetryResponse(BaseModel):
    uuid: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    altitude: Optional[float] = None
    magnetic_x: Optional[float] = Field(default=None, alias="magneticX")
    magnetic_y: Optional[float] = Field(default=None, alias="magneticY")
    magnetic_z: Optional[float] = Field(default=None, alias="magneticZ")
    soc: Optional[str] = None
    phone_battery_soc: Optional[float] = Field(default=None, alias="phoneBatterySOC")
    velocity: Optional[float] = None
    total_distance: Optional[float] = Field(default=None, alias="totalDistance")
    epoch_time: Optional[str] = Field(default=None, alias="epochTime")
    port_distance: Optional[float] = Field(default=None, alias="portDistance")

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)
