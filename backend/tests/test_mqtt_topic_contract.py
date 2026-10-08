import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CONTRACT = ROOT / "contracts/mqtt/v1/topic-contract.json"
TOPIC_IMPLEMENTATION = ROOT / "services/media-control/internal/mqtttopic/topic.go"
PROTO = ROOT / "contracts/proto/gcs/saker/v1/mqtt_gateway.proto"


def test_canonical_mqtt_contract_excludes_group_and_receiver() -> None:
    contract = json.loads(CONTRACT.read_text(encoding="utf-8"))

    assert contract["namespace"] == "gcs/device/{deviceUuid}/{publishSession}/{channel}"
    assert contract["identity"]["group"] == "server-side-session-lookup-only"
    assert contract["identity"]["receiver"] == "server-side-routing-only"
    assert set(contract["channels"]) == {"telemetry", "result", "command", "command_ack"}
    assert contract["constraints"]["wildcardsAllowedForDevice"] is False
    assert contract["constraints"]["qos"] == 1
    assert contract["constraints"]["retained"] is False


def test_media_control_implements_owned_contract_without_legacy_group_topic() -> None:
    source = TOPIC_IMPLEMENTATION.read_text(encoding="utf-8")
    proto = PROTO.read_text(encoding="utf-8")

    assert 'strings.Join([]string{"gcs", "device", t.DeviceUUID, t.PublishSession' in source
    assert "TelemetrySubscription" in source and '"gcs/device/+/+/telemetry"' in source
    assert "CommandAckSubscription" in source and '"gcs/device/+/+/command_ack"' in source
    assert "orgId" not in source
    assert "groupId" not in source
    assert "Group and receiver are always server-resolved" in proto
