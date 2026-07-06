class AiOverlayEventFields:
    EVENT_ID = 1
    STREAM_ID = 2
    MODEL_ID = 3
    KIND = 4
    LABEL = 5
    CONFIDENCE = 6
    POINT = 7
    GEO_ANCHOR = 8
    TIME = 9


class OverlayPointFields:
    X = 1
    Y = 2


class OverlayKinds:
    UNSPECIFIED = 0
    BOUNDING_BOX = 1
    POLYGON = 2
    LABEL = 3
    AUDIO_ALERT = 4


DEFAULT_AI_MODEL_ID = "mock-ai-sidecar-v1"
DEFAULT_AI_REPORT_TEXT = "AI overlay metadata event received."
