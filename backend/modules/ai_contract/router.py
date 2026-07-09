import asyncio
from typing import Annotated

from fastapi import APIRouter, Query
from fastapi.responses import JSONResponse

from core.structured_logging import get_logger
from core.tracing import trace_ai_sidecar_call
from modules.ai_contract.constants import AI_MOCK_UNAVAILABLE_STATUS_CODE
from modules.ai_contract.mock_service import MockAIService
from modules.ai_contract.provider import AIInferenceProvider
from modules.ai_contract.schemas import (
    AIEndpointErrorResponse,
    AIEndpointRequest,
    AIEndpointResponse,
)

router = APIRouter(prefix="/ai/mock", tags=["AI Mock"])
ai_provider: AIInferenceProvider = MockAIService()
logger = get_logger("ai-sidecar")


@router.post(
    "/detections",
    response_model=AIEndpointResponse,
    responses={AI_MOCK_UNAVAILABLE_STATUS_CODE: {"model": AIEndpointErrorResponse}},
)
async def run_mock_ai_detection(
    request: AIEndpointRequest,
    latency_ms: Annotated[int, Query(alias="latencyMs", ge=0, le=5000)] = 0,
    simulate_error: Annotated[bool, Query(alias="simulateError")] = False,
) -> AIEndpointResponse | JSONResponse:
    if latency_ms:
        await asyncio.sleep(latency_ms / 1000)

    with trace_ai_sidecar_call(stream_id=request.stream_id, schema_version=request.schema_version):
        logger.info(
            "ai_detection_requested",
            stream_id=request.stream_id,
            schema_version=request.schema_version,
            simulate_error=simulate_error,
        )
        if simulate_error:
            error = await ai_provider.build_error(request)
            return JSONResponse(
                status_code=AI_MOCK_UNAVAILABLE_STATUS_CODE,
                content=error.model_dump(by_alias=True, mode="json"),
            )

        return await ai_provider.detect(request)
