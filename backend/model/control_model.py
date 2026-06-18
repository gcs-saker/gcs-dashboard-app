from typing import Literal

from pydantic import BaseModel, Field

from api.contracts import ControlProtocol

class ControlCommand(BaseModel):
    direction: Literal[
        "forward",
        "backward",
        "left",
        "right",
        "stop",
        "up",
        "down",
        "ascend",
        "descend",
        "rotate_left",
        "rotate_right",
        "take",
    ]
    cid: str = Field(pattern=r"^[A-Za-z0-9_-]{1,32}$")
    payload_format: Literal["legacy", "protobuf"] = "legacy"
    org_id: str = Field(default=ControlProtocol.DEFAULT_ORG_ID, pattern=r"^[A-Za-z0-9_-]{1,64}$")
    group_id: str = Field(default=ControlProtocol.DEFAULT_GROUP_ID, pattern=r"^[A-Za-z0-9_-]{1,64}$")
    stream_id: str = Field(default="", max_length=128)
