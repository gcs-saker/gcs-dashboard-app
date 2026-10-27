import importlib.util
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts/benchmarks/docker_mqtt_netem_fixture.py"


def load_module():
    scripts = str(ROOT / "scripts/benchmarks")
    if scripts not in sys.path:
        sys.path.insert(0, scripts)
    spec = importlib.util.spec_from_file_location("docker_mqtt_netem_fixture", SCRIPT)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


class FakeRunner:
    def __init__(self) -> None:
        self.commands: list[list[str]] = []

    def run(self, command: list[str], timeout: int = 60) -> str:
        self.commands.append(command)
        if command[:2] == ["docker", "run"] and "--cap-add" in command:
            return json.dumps({"mqttRoundTripMs": [2, 4], "failures": 0})
        return "fixture-id"


def test_mqtt_matrix_runs_real_application_roundtrips_and_cleans_up(tmp_path: Path) -> None:
    module = load_module()
    config = tmp_path / "deploy/mqtt-test/mosquitto.conf"
    config.parent.mkdir(parents=True)
    config.write_text("listener 1883\nallow_anonymous true\n")
    runner = FakeRunner()

    result = module.execute(tmp_path, "gcs-net-fixture-mqtt", 2, runner)

    assert len(result["results"]) == 4
    assert all(item["metrics"]["received"] == 2 for item in result["results"])
    assert ["docker", "rm", "--force", "gcs-net-fixture-mqtt-mqtt"] in runner.commands
    assert ["docker", "network", "rm", "gcs-net-fixture-mqtt-net"] in runner.commands


def test_broker_and_probe_are_hardened_and_pinned(tmp_path: Path) -> None:
    module = load_module()
    broker = module.broker_command("gcs-net-fixture-mqtt-net", "broker", tmp_path / "mosquitto.conf")
    probe = module.probe_command(
        "gcs-net-fixture-mqtt-net",
        module.CONDITIONS[0],
        30,
        probe_script=module.MQTT_SCRIPT,
        target_host="mqtt",
        target_port=1883,
    )

    assert "@sha256:" in module.MOSQUITTO_IMAGE
    assert broker[broker.index("--cap-drop") + 1] == "ALL"
    assert broker[broker.index("--user") + 1] == "1883:1883"
    assert broker[broker.index("--entrypoint") + 1] == "mosquitto"
    assert "--read-only" in broker
    assert probe[probe.index("--cap-add") + 1] == "NET_ADMIN"
    assert "TARGET_PORT=1883" in probe


def test_mqtt_summary_reports_received_failures_and_nearest_rank() -> None:
    module = load_module()

    result = module.summarize({"mqttRoundTripMs": [1, 2, 3, 4], "failures": 1}, 5)

    assert result == {
        "samples": 5,
        "received": 4,
        "failures": 1,
        "mqttRoundTripMs": {"p50": 2.0, "p95": 4.0, "p99": 4.0},
    }
