from __future__ import annotations

from dataclasses import dataclass

from modules.protocol_v2.ai_overlay_contract import OverlayPointFields
from modules.protocol_v2.wire import decode_message, encode_double
from modules.protocol_v2.wire_helpers import single_float


@dataclass(frozen=True)
class OverlayPointPayload:
    x: float
    y: float

    def to_protobuf_wire(self) -> bytes:
        payload = bytearray()
        encode_double(payload, OverlayPointFields.X, self.x)
        encode_double(payload, OverlayPointFields.Y, self.y)
        return bytes(payload)

    @classmethod
    def from_protobuf_wire(cls, payload: bytes) -> "OverlayPointPayload":
        decoded = decode_message(payload)
        return cls(
            x=single_float(decoded, OverlayPointFields.X),
            y=single_float(decoded, OverlayPointFields.Y),
        )


def points_from_bbox(x: float, y: float, width: float, height: float) -> tuple[OverlayPointPayload, ...]:
    return (
        OverlayPointPayload(x=x, y=y),
        OverlayPointPayload(x=x + width, y=y),
        OverlayPointPayload(x=x + width, y=y + height),
        OverlayPointPayload(x=x, y=y + height),
    )
