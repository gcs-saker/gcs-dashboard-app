from fastapi import APIRouter

from api.contracts import ControlProtocol, ControlRoutes
from api.errors import ServiceUnavailableApiError
from model.control_model import ControlCommand
from mqtt.client import publish_control_command
from mqtt.topics import command_topic
from modules.protocol_v2.stream_control import StreamCommandPayload

router = APIRouter()


@router.post(ControlRoutes.SEND)
async def control_robot(command: ControlCommand):
    try:
        topic, message = build_control_message(command)
        publish_control_command(topic, message)
        return {"status": ControlProtocol.SENT_STATUS, "topic": topic, "message": command.direction}
    except Exception as e:
        raise ServiceUnavailableApiError(str(e))


def build_control_message(command: ControlCommand) -> tuple[str, str | bytes]:
    if command.payload_format == ControlProtocol.PROTOBUF_PAYLOAD_FORMAT:
        topic = command_topic(
            org_id=command.org_id,
            group_id=command.group_id,
            asset_id=command.cid,
        )
        return topic, StreamCommandPayload.create(
            stream_id=command.stream_id,
            target_asset_id=command.cid,
            command_type=command.direction,
        ).to_protobuf_wire()

    return f"{ControlProtocol.TOPIC_PREFIX}/{command.cid}", command.direction
