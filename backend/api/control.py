from fastapi import APIRouter

from api.contracts import ControlProtocol, ControlRoutes
from api.errors import ServiceUnavailableApiError
from model.control_model import ControlCommand
from mqtt.client import publish_control_command

router = APIRouter()


@router.post(ControlRoutes.SEND)
async def control_robot(command: ControlCommand):
    try:
        topic = f"{ControlProtocol.TOPIC_PREFIX}/{command.cid}"
        publish_control_command(topic, command.direction)
        return {"status": ControlProtocol.SENT_STATUS, "topic": topic, "message": command.direction}
    except Exception as e:
        raise ServiceUnavailableApiError(str(e))
