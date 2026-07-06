from modules.ai_contract.constants import (
    AI_MOCK_UNAVAILABLE_STATUS_CODE,
    MOCK_AI_DETECTION_BBOX,
    MOCK_AI_DETECTION_CONFIDENCE,
    MOCK_AI_DETECTION_LABEL,
    MOCK_AI_DETECTION_TRACK_ID,
    MOCK_AI_ERROR_CODE,
    MOCK_AI_ERROR_MESSAGE,
    MOCK_AI_REPORT_TEXT,
    MOCK_AI_RISK_SCORE,
)
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
    "AI_MOCK_UNAVAILABLE_STATUS_CODE",
    "MOCK_AI_DETECTION_BBOX",
    "MOCK_AI_DETECTION_CONFIDENCE",
    "MOCK_AI_DETECTION_LABEL",
    "MOCK_AI_DETECTION_TRACK_ID",
    "MOCK_AI_ERROR_CODE",
    "MOCK_AI_ERROR_MESSAGE",
    "MOCK_AI_REPORT_TEXT",
    "MOCK_AI_RISK_SCORE",
]
