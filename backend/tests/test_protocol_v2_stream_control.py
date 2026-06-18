from __future__ import annotations

from modules.protocol_v2.stream_control import StreamCommandPayload


def test_stream_command_payload_round_trips_through_protobuf_wire() -> None:
    command = StreamCommandPayload.create(
        stream_id="raw.mobile.front",
        target_asset_id="CID001",
        command_type="stop",
        observed_unix_millis=1_781_721_600_000,
    )

    encoded = command.to_protobuf_wire()
    decoded = StreamCommandPayload.from_protobuf_wire(encoded)

    assert decoded == command
    assert len(encoded) < len(str(command).encode("utf-8"))
