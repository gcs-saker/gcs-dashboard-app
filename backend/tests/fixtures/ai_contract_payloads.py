from __future__ import annotations

from datetime import datetime, timezone
from typing import Final

from modules.ai_contract import AI_CONTRACT_SCHEMA_VERSION
from modules.ai_contract.constants import (
    MOCK_AI_DETECTION_BBOX,
    MOCK_AI_DETECTION_CONFIDENCE,
    MOCK_AI_DETECTION_LABEL,
    MOCK_AI_DETECTION_TRACK_ID,
    MOCK_AI_REPORT_TEXT,
    MOCK_AI_RISK_SCORE,
)

AI_SAMPLE_STREAM_ID: Final = "raw.sample.front"
AI_SAMPLE_REAR_STREAM_ID: Final = "raw.sample.rear"
AI_SAMPLE_FRAME_ID: Final = "frame-0001"
AI_SAMPLE_CAPTURED_AT: Final = "2026-05-22T08:00:00Z"
AI_SAMPLE_IMAGE_URL: Final = "https://media.example.test/raw/sample/front/frame-0001.jpg"
AI_SAMPLE_PTS_MS: Final = 1200
AI_SAMPLE_GENERATED_AT: Final = datetime(2026, 5, 22, 8, 0, 1, tzinfo=timezone.utc)
AI_SAMPLE_OBSERVED_UNIX_MILLIS: Final = 1_779_436_800_000
AI_SAMPLE_RECEIVED_UNIX_MILLIS: Final = 1_779_436_801_000


def valid_ai_frame_payload(
    *,
    stream_id: str = AI_SAMPLE_STREAM_ID,
    captured_at: str = AI_SAMPLE_CAPTURED_AT,
) -> dict[str, object]:
    return {
        "streamId": stream_id,
        "frameId": AI_SAMPLE_FRAME_ID,
        "capturedAt": captured_at,
        "ptsMs": AI_SAMPLE_PTS_MS,
    }


def valid_ai_request_payload() -> dict[str, object]:
    return {
        "schemaVersion": AI_CONTRACT_SCHEMA_VERSION,
        "streamId": AI_SAMPLE_STREAM_ID,
        "frame": valid_ai_frame_payload(),
        "imageUrl": AI_SAMPLE_IMAGE_URL,
    }


def valid_ai_response_payload() -> dict[str, object]:
    return {
        "schemaVersion": AI_CONTRACT_SCHEMA_VERSION,
        "streamId": AI_SAMPLE_STREAM_ID,
        "frame": valid_ai_frame_payload(),
        "generatedAt": AI_SAMPLE_GENERATED_AT,
        "riskScore": MOCK_AI_RISK_SCORE,
        "reportText": MOCK_AI_REPORT_TEXT,
        "detections": [mock_ai_detection_payload()],
    }


def mock_ai_detection_payload() -> dict[str, object]:
    return {
        "label": MOCK_AI_DETECTION_LABEL,
        "bbox": dict(MOCK_AI_DETECTION_BBOX),
        "confidence": MOCK_AI_DETECTION_CONFIDENCE,
        "riskScore": MOCK_AI_RISK_SCORE,
        "trackId": MOCK_AI_DETECTION_TRACK_ID,
    }
