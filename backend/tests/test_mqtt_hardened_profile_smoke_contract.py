from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
SMOKE_SCRIPT = REPO_ROOT / "scripts" / "mqtt_hardened_profile_smoke.py"
ACL = REPO_ROOT / "deploy" / "mosquitto" / "acl.hardened"
README = REPO_ROOT / "deploy" / "mosquitto" / "README.md"


def run_check() -> dict:
    result = subprocess.run(
        [sys.executable, str(SMOKE_SCRIPT), "--check"],
        check=False,
        capture_output=True,
        text=True,
        cwd=REPO_ROOT,
    )

    assert result.returncode == 0, result.stderr
    return json.loads(result.stdout)


def test_mqtt_hardened_smoke_reports_acl_protobuf_and_runtime_boundary() -> None:
    payload = run_check()

    assert payload["schemaVersion"] == "mqtt-hardened-profile-smoke-v1"
    assert payload["status"] == "hardened-profile-runtime-contract"
    assert payload["topicNamespace"]["telemetry"] == "gcs/{orgId}/{groupId}/{assetId}/telemetry"
    assert "device gateway publishes protobuf telemetry" in "\n".join(payload["allowedFlows"])
    assert "anonymous MQTT clients are rejected" in payload["deniedFlows"]
    assert payload["protobufBoundary"]["mediaFrames"].startswith("never carried by MQTT")
    assert "device telemetry publish reaches backend subscriber" in payload["runtimeChecks"]
    assert "broker credential rotation drill" in payload["promotionGate"]


def test_mqtt_hardened_smoke_isolated_compose_contract_avoids_volume_deletion() -> None:
    source = SMOKE_SCRIPT.read_text(encoding="utf-8")
    payload = run_check()

    assert payload["profile"]["composeCommand"][:3] == ["docker", "compose", "-p"]
    assert "COMPOSE_PROJECT_NAME from inherited env files is filtered" in "\n".join(payload["safety"])
    assert "down --remove-orphans" in source
    assert "down\", \"-v\"" not in source
    assert "--remove-orphans" in payload["profile"]["composeCommand"] or "--remove-orphans" in source


def test_mqtt_acl_and_guide_keep_dashboard_outside_broker_and_health_readable() -> None:
    acl = ACL.read_text(encoding="utf-8")
    readme = README.read_text(encoding="utf-8")

    assert "user gcs_backend_pub" in acl
    assert "topic read $SYS/#" in acl
    assert "user gcs_device_gateway" in acl
    assert "topic write gcs/+/+/+/telemetry" in acl
    assert "The dashboard must never receive MQTT credentials" in readme
    assert "Media frames must not be carried by MQTT" in readme
    assert "python3 scripts/mqtt_hardened_profile_smoke.py --run" in readme
