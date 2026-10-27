import importlib.util
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts/benchmarks/docker_turn_netem_fixture.py"


def load_module():
    scripts = str(ROOT / "scripts/benchmarks")
    if scripts not in sys.path:
        sys.path.insert(0, scripts)
    spec = importlib.util.spec_from_file_location("docker_turn_netem_fixture", SCRIPT)
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
            return json.dumps({"turnAllocationMs": [5, 7], "failures": 0})
        return "fixture-id"


def test_turn_matrix_allocates_under_each_condition_and_cleans_up(tmp_path: Path) -> None:
    module = load_module()
    runner = FakeRunner()

    result = module.execute(tmp_path, "gcs-net-fixture-turn", 2, runner)

    assert len(result["results"]) == 4
    assert all(item["metrics"]["allocated"] == 2 for item in result["results"])
    assert ["docker", "rm", "--force", "gcs-net-fixture-turn-turn"] in runner.commands
    assert ["docker", "network", "rm", "gcs-net-fixture-turn-net"] in runner.commands


def test_turn_server_and_probe_are_pinned_bounded_and_nonproduction() -> None:
    module = load_module()
    server = module.turn_command("gcs-net-fixture-turn-net", "turn")
    probe = module.turn_probe_command("gcs-net-fixture-turn-net", module.CONDITIONS[0], 30)

    assert "@sha256:" in module.COTURN_IMAGE
    assert server[server.index("--cap-drop") + 1] == "ALL"
    assert server[server.index("--cap-add") + 1] == "NET_BIND_SERVICE"
    assert server[server.index("--user") + 1] == "65534:65534"
    assert "--min-port=49160" in server and "--max-port=49600" in server
    assert "--no-tls" in server and "--no-dtls" in server
    assert probe[probe.index("--cap-add") + 1] == "NET_ADMIN"
    assert module.FIXTURE_REALM.endswith(".invalid")


def test_turn_summary_reports_allocations_failures_and_percentiles() -> None:
    module = load_module()

    result = module.summarize({"turnAllocationMs": [4, 6, 8, 10], "failures": 1}, 5)

    assert result == {
        "samples": 5,
        "allocated": 4,
        "failures": 1,
        "turnAllocationMs": {"p50": 6.0, "p95": 10.0, "p99": 10.0},
    }
