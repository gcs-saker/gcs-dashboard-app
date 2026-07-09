from __future__ import annotations

import re
import subprocess
from pathlib import Path

from modules.protocol_v2.stream_control import StreamCommandPayload
from modules.protocol_v2.telemetry import TelemetryEnvelopePayload

REPO_ROOT = Path(__file__).resolve().parents[2]
PROTO_ROOT = REPO_ROOT / "contracts" / "proto"
PROTO_FILES = sorted((PROTO_ROOT / "gcs" / "saker" / "v1").glob("*.proto"))
DESCRIPTOR_SET = REPO_ROOT / "tmp" / "gcs-saker-protobuf-contract.pb"


def test_proto_files_compile_to_descriptor_set() -> None:
    DESCRIPTOR_SET.parent.mkdir(parents=True, exist_ok=True)

    result = subprocess.run(
        [
            "protoc",
            f"--proto_path={PROTO_ROOT}",
            f"--descriptor_set_out={DESCRIPTOR_SET}",
            "--include_imports",
            *[str(path.relative_to(PROTO_ROOT)) for path in PROTO_FILES],
        ],
        cwd=REPO_ROOT,
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    assert DESCRIPTOR_SET.exists()
    assert DESCRIPTOR_SET.stat().st_size > 0


def test_proto_files_use_stable_package_and_language_options() -> None:
    for proto_file in PROTO_FILES:
        content = proto_file.read_text(encoding="utf-8")

        assert "package gcs.saker.v1;" in content
        assert (
            'option go_package = "github.com/gcs-saker/gcs-dashboard-app/contracts/gen/go/gcs/saker/v1;sakerv1";'
            in content
        )
        assert "option java_multiple_files = true;" in content
        assert 'option java_package = "kr.co.a4ai.gcssaker.contracts.v1";' in content


def test_evolvable_event_messages_keep_reserved_field_ranges() -> None:
    event_proto_files = [
        "ai_overlay.proto",
        "gateway_service.proto",
        "ops_event.proto",
        "stream_control.proto",
        "telemetry.proto",
    ]

    for file_name in event_proto_files:
        content = (PROTO_ROOT / "gcs" / "saker" / "v1" / file_name).read_text(encoding="utf-8")
        message_names = re.findall(r"message\s+(\w+)\s+\{", content)
        assert message_names, f"{file_name} has no message definitions"
        assert "reserved" in content, f"{file_name} must reserve fields for compatibility"


def test_grpc_gateway_contract_is_internal_bidi_streaming_only() -> None:
    content = (PROTO_ROOT / "gcs" / "saker" / "v1" / "gateway_service.proto").read_text(encoding="utf-8")

    assert "service SakerGatewayService" in content
    assert "rpc Exchange(stream GatewayStreamRequest) returns (stream GatewayStreamResponse);" in content
    assert "oneof payload" in content
    assert "Browser" not in content
    assert "Dashboard" not in content
    assert "DashboardRequest" not in content


def test_python_telemetry_decoder_accepts_descriptor_encoded_payload() -> None:
    payload = encode_proto(
        "gcs.saker.v1.TelemetryEnvelope",
        "gcs/saker/v1/telemetry.proto",
        """
event_id: "evt-20260618-0001"
org_id: "a4ai"
group_id: "co-a"
asset_id: "raw.mobile.front"
asset_kind: ASSET_KIND_OPERATOR_DEVICE
time {
  observed_unix_millis: 1781721600000
  received_unix_millis: 1781721600042
}
position {
  latitude: 35.871435
  longitude: 128.601445
  altitude_m: 84.5
}
heading_deg: 7.2
speed_mps: 3.5
battery_percent: 78.0
health: HEALTH_STATE_OK
active_stream_ids: "raw.mobile.front"
""",
    )

    decoded = TelemetryEnvelopePayload.from_protobuf_wire(payload)

    assert decoded.event_id == "evt-20260618-0001"
    assert decoded.asset_id == "raw.mobile.front"
    assert decoded.observed_unix_millis == 1_781_721_600_000
    assert decoded.received_unix_millis == 1_781_721_600_042
    assert decoded.latitude == 35.871435
    assert decoded.longitude == 128.601445
    assert decoded.active_stream_ids == ("raw.mobile.front",)


def test_python_stream_command_decoder_accepts_descriptor_encoded_payload() -> None:
    payload = encode_proto(
        "gcs.saker.v1.StreamCommand",
        "gcs/saker/v1/stream_control.proto",
        """
command_id: "cmd-001"
stream_id: "raw.mobile.front"
target_asset_id: "CID001"
command_type: "stop"
payload: "soft"
time {
  observed_unix_millis: 1781721600000
  received_unix_millis: 1781721600000
}
""",
    )

    decoded = StreamCommandPayload.from_protobuf_wire(payload)

    assert decoded.command_id == "cmd-001"
    assert decoded.stream_id == "raw.mobile.front"
    assert decoded.target_asset_id == "CID001"
    assert decoded.command_type == "stop"
    assert decoded.payload == b"soft"
    assert decoded.observed_unix_millis == 1_781_721_600_000


def encode_proto(message_type: str, proto_file: str, textproto: str) -> bytes:
    result = subprocess.run(
        [
            "protoc",
            f"--proto_path={PROTO_ROOT}",
            f"--encode={message_type}",
            proto_file,
        ],
        input=textproto.encode("utf-8"),
        cwd=REPO_ROOT,
        check=False,
        capture_output=True,
    )

    assert result.returncode == 0, result.stderr.decode("utf-8")
    return result.stdout
