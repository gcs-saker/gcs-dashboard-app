from datetime import datetime, timezone

from modules.ai_contract.constants import (
    AI_CONTRACT_SCHEMA_VERSION,
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
    AIEndpointErrorResponse,
    AIEndpointRequest,
    AIEndpointResponse,
)


class MockAIService:
    def __init__(self, generated_at: datetime | None = None) -> None:
        self._generated_at = generated_at

    async def detect(self, request: AIEndpointRequest) -> AIEndpointResponse:
        return AIEndpointResponse.model_validate(
            {
                "schemaVersion": AI_CONTRACT_SCHEMA_VERSION,
                "streamId": request.stream_id,
                "frame": request.frame.model_dump(by_alias=True),
                "generatedAt": self._now(),
                "riskScore": MOCK_AI_RISK_SCORE,
                "reportText": MOCK_AI_REPORT_TEXT,
                "detections": [
                    {
                        "label": MOCK_AI_DETECTION_LABEL,
                        "bbox": MOCK_AI_DETECTION_BBOX,
                        "confidence": MOCK_AI_DETECTION_CONFIDENCE,
                        "riskScore": MOCK_AI_RISK_SCORE,
                        "trackId": MOCK_AI_DETECTION_TRACK_ID,
                    }
                ],
            }
        )

    async def build_error(self, request: AIEndpointRequest) -> AIEndpointErrorResponse:
        return AIEndpointErrorResponse.model_validate(
            {
                "schemaVersion": AI_CONTRACT_SCHEMA_VERSION,
                "streamId": request.stream_id,
                "frame": request.frame.model_dump(by_alias=True),
                "generatedAt": self._now(),
                "error": {
                    "code": MOCK_AI_ERROR_CODE,
                    "message": MOCK_AI_ERROR_MESSAGE,
                    "retryable": True,
                },
            }
        )

    def _now(self) -> datetime:
        return self._generated_at or datetime.now(timezone.utc)
