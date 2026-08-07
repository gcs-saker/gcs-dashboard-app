from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy.orm import Session

from core.db import get_db
from core.security import AuthenticatedUser, get_current_user
from modules.ai_adapter.service import AIAdapterService, AIProcessorNotFoundError, AIProcessorUnavailableError
from modules.ai_adapter.settings import AIAdapterSettings
from modules.ai_contract.schemas import AIEndpointResponse

router = APIRouter(prefix="/ai", tags=["AI Adapter"])


class AIAnalysisRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True, str_strip_whitespace=True)
    stream_id: str = Field(alias="streamId", min_length=1, max_length=160)
    processor_id: str = Field(alias="processorId", min_length=1, max_length=128)
    group_id: str = Field(alias="groupId", min_length=1, max_length=64)

    @field_validator("stream_id")
    @classmethod
    def validate_stream_id(cls, value: str) -> str:
        if not AIAdapterService.is_canonical_stream_id(value):
            raise ValueError("streamId must be a canonical stream path")
        return value


@router.post("/analyze", response_model=AIEndpointResponse)
async def analyze_stream(
    request: AIAnalysisRequest,
    _principal: Annotated[AuthenticatedUser, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> AIEndpointResponse:
    try:
        return await AIAdapterService(AIAdapterSettings.from_env()).analyze(
            db, request.stream_id, request.processor_id, request.group_id
        )
    except AIProcessorNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except AIProcessorUnavailableError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
