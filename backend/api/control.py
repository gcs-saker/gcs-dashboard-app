from typing import Annotated

from fastapi import APIRouter, Depends

from api.contracts import ControlProtocol, ControlRoutes
from api.errors import ServiceUnavailableApiError
from model.control_model import ControlCommand
from modules.messaging.control_publisher import ControlMessagePublisher, get_control_message_publisher
from modules.messaging.sender import MessageSenderError

router = APIRouter()


@router.post(ControlRoutes.SEND)
async def control_robot(
    command: ControlCommand,
    publisher: Annotated[ControlMessagePublisher, Depends(get_control_message_publisher)],
):
    try:
        result = publisher.publish(command)
        return {"status": ControlProtocol.SENT_STATUS, "topic": result.destination, "message": command.direction}
    except MessageSenderError as e:
        raise ServiceUnavailableApiError(str(e))
