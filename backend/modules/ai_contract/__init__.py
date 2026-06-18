from modules.ai_contract.schemas import (
    AI_CONTRACT_SCHEMA_VERSION,
    AIEndpointErrorResponse,
    AIEndpointRequest,
    AIEndpointResponse,
    BoundingBox,
    DetectionResult,
    FrameReference,
)
from modules.ai_contract.mock_service import MockAIService
from modules.ai_contract.provider import AIInferenceProvider

__all__ = [
    "AI_CONTRACT_SCHEMA_VERSION",
    "AIEndpointErrorResponse",
    "AIEndpointRequest",
    "AIEndpointResponse",
    "BoundingBox",
    "DetectionResult",
    "FrameReference",
    "MockAIService",
    "AIInferenceProvider",
]
