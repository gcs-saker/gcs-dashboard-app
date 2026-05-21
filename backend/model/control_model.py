from pydantic import BaseModel

class ControlCommand(BaseModel):
    direction: str
    cid: str
