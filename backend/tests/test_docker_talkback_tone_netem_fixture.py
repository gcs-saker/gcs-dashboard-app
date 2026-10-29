import importlib.util
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts/benchmarks/docker_talkback_tone_netem_fixture.py"


def load_module():
    scripts = str(ROOT / "scripts/benchmarks")
    if scripts not in sys.path:
        sys.path.insert(0, scripts)
    spec = importlib.util.spec_from_file_location("docker_talkback_tone_netem_fixture", SCRIPT)
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
        if command[:2] == ["docker", "logs"]:
            return "Talkback tone publisher connected"
        if command[:2] == ["docker", "run"] and "--cap-add" in command:
            path = "relay" if "TURN_USER=gcs-fixture" in command else "direct"
            return json.dumps(
                {"tone_latency_ms": 24, "frames_before_tone": 100, "arrival_gap_max_ms": 25, "path": path},
            )
        return "fixture-id"


def test_talkback_matrix_detects_tone_and_cleans_up(tmp_path: Path) -> None:
    module = load_module()
    config = tmp_path / "deploy/network/mediamtx.webrtc-fixture.yml"
    config.parent.mkdir(parents=True)
    config.write_text("paths: {all: {source: publisher}}\n")
    runner = FakeRunner()

    result = module.execute(tmp_path, "gcs-net-fixture-talkback", 2, runner)

    assert len(result["results"]) == 4
    assert all(item["metrics"]["detected"] == 2 for item in result["results"])
    assert all(item["metrics"]["directPaths"] == 2 for item in result["results"])
    assert ["docker", "network", "rm", "gcs-net-fixture-talkback-net"] in runner.commands
    publishers = [command for command in runner.commands if "/opt/gcs/webrtc_talkback_tone_publisher.py" in command]
    assert len(publishers) == 8
    assert len({command[command.index("--whip-url") + 1] for command in publishers}) == 8


def test_receiver_is_only_container_granted_net_admin() -> None:
    module = load_module()

    publisher = module.publisher_command("fixture-net", "publisher", "talkback/raw/fixture/sample", 1)
    receiver = module.receiver_command("fixture-net", module.CONDITIONS[0], "path", 1)

    assert "--cap-drop" in publisher
    assert "--cap-add" not in publisher
    assert receiver[receiver.index("--cap-add") + 1] == "NET_ADMIN"
    assert "TALKBACK_PATH=path" in receiver


def test_relay_matrix_requires_relay_tone_delivery(tmp_path: Path) -> None:
    module = load_module()
    config = tmp_path / "deploy/network/mediamtx.webrtc-fixture.yml"
    config.parent.mkdir(parents=True)
    config.write_text("paths: {all: {source: publisher}}\n")
    runner = FakeRunner()

    result = module.execute_relay(tmp_path, "gcs-net-fixture-talkback-relay", 2, runner)

    assert result["schemaVersion"] == "gcs-saker.talkback-tone-relay-netem-fixture.v1"
    assert all(item["metrics"]["detected"] == 2 for item in result["results"])
    assert all(item["metrics"]["relayPaths"] == 2 for item in result["results"])


def test_relay_receiver_uses_turn_credentials_and_relay_policy() -> None:
    module = load_module()

    command = module.relay_receiver_command("fixture-net", module.CONDITIONS[0], "path", 1)

    assert "TURN_USER=gcs-fixture" in command
    assert "TURN_PASSWORD=fixture-password-not-for-production" in command
    assert "--relay-only" in module.RELAY_RECEIVER_SCRIPT
    assert command[command.index("--cap-add") + 1] == "NET_ADMIN"


def test_summary_counts_detection_failures_and_percentiles() -> None:
    module = load_module()
    samples = [
        {"tone_latency_ms": 10, "frames_before_tone": 5, "arrival_gap_max_ms": 21, "path": "direct"},
        {"tone_latency_ms": 20, "frames_before_tone": 6, "arrival_gap_max_ms": 30, "path": "direct"},
        {},
    ]

    result = module.summarize(samples, 3)

    assert result["detected"] == 2
    assert result["failures"] == 1
    assert result["toneLatencyMs"]["p95"] == 20
    assert result["framesBeforeToneMax"] == 6
