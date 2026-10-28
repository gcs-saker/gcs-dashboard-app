import importlib.util
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts/benchmarks/docker_webrtc_relay_netem_fixture.py"


def load_module():
    scripts = str(ROOT / "scripts/benchmarks")
    if scripts not in sys.path:
        sys.path.insert(0, scripts)
    spec = importlib.util.spec_from_file_location("docker_webrtc_relay_netem_fixture", SCRIPT)
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
            return "WHIP publisher connected"
        if command[:2] == ["docker", "run"] and "--cap-add" in command:
            return json.dumps({"iceConnectedMs": 40, "signalingMs": 8, "path": "relay"})
        return "fixture-id"


def test_relay_matrix_requires_relay_paths_and_cleans_up(tmp_path: Path) -> None:
    module = load_module()
    config = tmp_path / "deploy/network/mediamtx.webrtc-fixture.yml"
    config.parent.mkdir(parents=True)
    config.write_text("paths: {all: {source: publisher}}\n")
    runner = FakeRunner()

    result = module.execute(tmp_path, "gcs-net-fixture-relay", 2, runner)

    assert len(result["results"]) == 4
    assert all(item["metrics"]["paths"]["relay"] == 2 for item in result["results"])
    assert ["docker", "rm", "--force", "gcs-net-fixture-relay-turn"] in runner.commands
    assert ["docker", "network", "rm", "gcs-net-fixture-relay-net"] in runner.commands


def test_relay_receiver_forces_turn_and_relay_policy() -> None:
    module = load_module()
    command = module.receiver_command("gcs-net-fixture-relay-net", module.CONDITIONS[0])

    assert "TURN_USER=gcs-fixture" in command
    assert "TURN_PASSWORD=fixture-password-not-for-production" in command
    assert "--cap-add" in command and command[command.index("--cap-add") + 1] == "NET_ADMIN"
    assert "--relay-only" in module.RELAY_RECEIVER_SCRIPT
    assert "--require-relay-path" in module.RELAY_RECEIVER_SCRIPT


def test_relay_summary_marks_unknown_as_failure() -> None:
    module = load_module()
    result = module.summarize(
        [
            {"iceConnectedMs": 40, "signalingMs": 8, "path": "relay"},
            {"path": "unknown"},
        ],
        2,
    )

    assert result["connected"] == 1
    assert result["failures"] == 1
    assert result["paths"] == {"direct": 0, "relay": 1, "unknown": 1}
