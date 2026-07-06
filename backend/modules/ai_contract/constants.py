from __future__ import annotations

from typing import Final, Literal


AI_CONTRACT_SCHEMA_VERSION: Final[Literal["ai.detection.v1alpha1"]] = "ai.detection.v1alpha1"
AI_MOCK_UNAVAILABLE_STATUS_CODE: Final = 503

MOCK_AI_RISK_SCORE: Final = 0.72
MOCK_AI_REPORT_TEXT: Final = "Mock AI detected a person near the sample stream."
MOCK_AI_ERROR_CODE: Final = "AI_SIMULATED_ERROR"
MOCK_AI_ERROR_MESSAGE: Final = "Mock AI endpoint simulated an error."

MOCK_AI_DETECTION_LABEL: Final = "person"
MOCK_AI_DETECTION_CONFIDENCE: Final = 0.88
MOCK_AI_DETECTION_TRACK_ID: Final = "mock-person-001"
MOCK_AI_DETECTION_BBOX: Final = {
    "x": 0.18,
    "y": 0.22,
    "width": 0.24,
    "height": 0.34,
}
