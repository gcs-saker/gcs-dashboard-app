from typing import Literal

from pydantic import BaseModel, Field

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
