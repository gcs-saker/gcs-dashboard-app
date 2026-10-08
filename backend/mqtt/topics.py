from __future__ import annotations

from dataclasses import dataclass
from typing import Final


class MqttTopicSegments:
    ROOT: Final = "gcs"
    COMMAND: Final = "command"
    COMMAND_ACK: Final = "command_ack"


@dataclass(frozen=True)
class MqttAssetTopic:
    org_id: str
    group_id: str
    asset_id: str
    channel: str

    def value(self) -> str:
        return "/".join(
            [
                MqttTopicSegments.ROOT,
                self.org_id,
                self.group_id,
                self.asset_id,
                self.channel,
            ]
        )


def command_topic(org_id: str, group_id: str, asset_id: str) -> str:
    return MqttAssetTopic(
        org_id=org_id,
        group_id=group_id,
        asset_id=asset_id,
        channel=MqttTopicSegments.COMMAND,
    ).value()
