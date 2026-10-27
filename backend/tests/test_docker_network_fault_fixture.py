import importlib.util
import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts/benchmarks/docker_network_fault_fixture.py"


def load_module():
    scripts = str(ROOT / "scripts/benchmarks")
    if scripts not in sys.path:
        sys.path.insert(0, scripts)
    spec = importlib.util.spec_from_file_location("docker_network_fault_fixture", SCRIPT)
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
            return json.dumps({"dnsMs": [1, 2], "connectMs": [3, 4], "failures": 0})
        return "fixture-id"


def test_fixture_runs_bounded_conditions_and_always_cleans_up(tmp_path: Path) -> None:
    module = load_module()
    runner = FakeRunner()

    result = module.execute(tmp_path, "gcs-net-fixture-test", 2, runner)

    assert [item["condition"]["name"] for item in result["results"]] == [
        "baseline",
        "delay",
        "loss",
        "reorder",
    ]
    assert ["docker", "rm", "--force", "gcs-net-fixture-test-target"] in runner.commands
    assert ["docker", "network", "rm", "gcs-net-fixture-test-net"] in runner.commands


def test_probe_has_only_net_admin_and_resource_bounds() -> None:
    module = load_module()
    command = module.probe_command("gcs-net-fixture-test-net", module.CONDITIONS[1], 30)

    assert command[command.index("--cap-drop") + 1] == "ALL"
    assert command[command.index("--cap-add") + 1] == "NET_ADMIN"
    assert command[command.index("--user") + 1] == "0:0"
    assert command[command.index("--pids-limit") + 1] == "32"
    assert command[command.index("--memory") + 1] == "64m"
    assert "NETEM_DELAY_MS=50" in command


@pytest.mark.parametrize(
    ("project", "target", "samples"),
    [
        ("gcs-net-fixture-a", "server01-production", 30),
        ("production", "local-fixture", 30),
        ("gcs-net-fixture-a", "local-fixture", 0),
        ("gcs-net-fixture-a", "local-fixture", 101),
    ],
)
def test_fixture_rejects_production_and_invalid_bounds(project: str, target: str, samples: int) -> None:
    module = load_module()

    with pytest.raises(ValueError):
        module.validate(project, target, samples)


def test_dockerfile_is_pinned_and_entrypoint_applies_netem() -> None:
    dockerfile = (ROOT / "deploy/network/Dockerfile.netem-probe").read_text()
    entrypoint = (ROOT / "deploy/network/netem-probe-entrypoint.sh").read_text()

    assert "python:3.12-alpine@sha256:" in dockerfile
    assert "iproute2=" in dockerfile
    assert "tc qdisc replace dev eth0 root netem" in entrypoint
