from __future__ import annotations

from typing import Protocol

from modules.ai_contract.schemas import (
    AIEndpointErrorResponse,
    AIEndpointRequest,
    AIEndpointResponse,
)


class AIInferenceProvider(Protocol):
    async def detect(self, request: AIEndpointRequest) -> AIEndpointResponse:
        ...

    async def build_error(self, request: AIEndpointRequest) -> AIEndpointErrorResponse:
        ...

