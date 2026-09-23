import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts/smoke/control_broker_e2e.sh"


def test_control_broker_e2e_contract_passes() -> None:
    result = subprocess.run(["bash", str(SCRIPT), "--check"], cwd=ROOT, check=True, capture_output=True, text=True)

    assert "control broker E2E contract check passed" in result.stdout


def test_control_broker_e2e_is_test_only_and_cleans_resources() -> None:
    source = SCRIPT.read_text(encoding="utf-8")

    assert "gcs-saker.test-only=true" in source
    assert "trap cleanup EXIT" in source
    assert "docker rm -f" in source
    assert "docker network rm" in source
    assert "-p " not in source
    assert "TEST_CONTROL_MQTT_URL=tcp://mqtt:1883" in source
