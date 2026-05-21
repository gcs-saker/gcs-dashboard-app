from fastapi import APIRouter, HTTPException
from model.control_model import ControlCommand
from mqtt.client import publish_control_command

router = APIRouter()

@router.post("/")
async def control_robot(command: ControlCommand):
    try:
        print("들어옴")
        topic = f"robot/control/{command.cid}"
        publish_control_command(topic, command.direction)
        return {"status": "sent", "topic": topic, "message": command.direction}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
