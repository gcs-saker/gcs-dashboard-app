from datetime import datetime, timezone

from modules.ai_contract.schemas import (
    AI_CONTRACT_SCHEMA_VERSION,
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
                "riskScore": 0.72,
                "reportText": "Mock AI detected a person near the sample stream.",
                "detections": [
                    {
                        "label": "person",
                        "bbox": {
                            "x": 0.18,
                            "y": 0.22,
                            "width": 0.24,
                            "height": 0.34,
                        },
                        "confidence": 0.88,
                        "riskScore": 0.72,
                        "trackId": "mock-person-001",
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
                    "code": "AI_SIMULATED_ERROR",
                    "message": "Mock AI endpoint simulated an error.",
                    "retryable": True,
                },
            }
        )

    def _now(self) -> datetime:
        return self._generated_at or datetime.now(timezone.utc)
