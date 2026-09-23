from typing import Final


class ControlProtocol:
    TOPIC_PREFIX: Final = "robot/control"
    DEFAULT_ORG_ID: Final = "a4ai"
    DEFAULT_GROUP_ID: Final = "co-a"
    PROTOBUF_PAYLOAD_FORMAT: Final = "protobuf"
    SENT_STATUS: Final = "sent"
