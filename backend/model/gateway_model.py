from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


# ✅ Create 용 DTO
class GatewayCreate(BaseModel):
    cid: str
    uuid: str
    company_id: int
    type: str  # "smartphone", "tablet", "smartwatch", "etc"
    os: str  # "android", "iphone", "etc"
    name: Optional[str] = None
    status: Optional[str] = None


# ✅ Response 용 DTO
class GatewayResponse(BaseModel):
    id: int
    cid: str
    uuid: str
    company_id: int
    type: str
    os: str
    name: Optional[str] = None
    status: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
