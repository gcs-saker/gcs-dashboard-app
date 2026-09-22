import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts/gates/security_campaign_gate.py"


def test_security_campaign_gate_covers_rest_grpc_mqtt_and_tokens() -> None:
    result = subprocess.run(
        ["python", str(SCRIPT), "--check"],
        cwd=ROOT,
        check=True,
        text=True,
        capture_output=True,
    )
    payload = json.loads(result.stdout)

    assert payload["schemaVersion"] == "gcs-saker.security-campaign.v1"
    assert payload["campaigns"] == {
        "grpc-boundary": "PASS",
        "grpc-fuzz": "PASS",
        "mqtt-boundary": "PASS",
        "mqtt-fuzz": "PASS",
        "rest-dast": "PASS",
        "token-fuzz": "PASS",
    }
