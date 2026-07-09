from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


# ✅ Create 용 DTO
class UnmannedAssetCreate(BaseModel):
    cid: str
    uuid: str
    company_id: int
    type: str  # "drone", "rover", "ugv", "usv", "uav", "cctv", "etc"
    name: str
    description: Optional[str] = None
    image_url: Optional[str] = None
    status: Optional[str] = "active"


# ✅ Response 용 DTO
class UnmannedAssetResponse(BaseModel):
    id: int
    cid: str
    uuid: str
    company_id: int
    type: str
    name: str
    description: Optional[str] = None
    image_url: Optional[str] = None
    status: str
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
