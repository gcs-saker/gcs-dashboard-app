import importlib.util
import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts/benchmarks/docker_webrtc_audio_resource_fixture.py"


def load_module():
    scripts = str(ROOT / "scripts/benchmarks")
    if scripts not in sys.path:
        sys.path.insert(0, scripts)
    spec = importlib.util.spec_from_file_location("docker_webrtc_audio_resource_fixture", SCRIPT)
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
        if command[:2] == ["docker", "stats"]:
            return "\n".join(
                json.dumps({"Name": name, "CPUPerc": "1.5%", "MemUsage": "12MiB / 128MiB"}) for name in command[5:]
            )
        if command[:2] == ["docker", "wait"]:
            return "0"
        if command[:2] == ["docker", "logs"]:
            if "receiver" in command[2]:
                return json.dumps(
                    {
                        "frames": 100,
                        "missing_frames": 0,
                        "arrival_gap_max_ms": 22,
                        "path": "relay",
                    }
                )
            return "WHIP publisher connected"
        return "fixture-id"


def test_resource_fixture_collects_all_conditions_and_cleans_up(tmp_path: Path) -> None:
    module = load_module()
    config = tmp_path / "deploy/network/mediamtx.webrtc-fixture.yml"
    config.parent.mkdir(parents=True)
    config.write_text("paths: {all: {source: publisher}}\n")
    request = module.ResourceRequest("gcs-net-fixture-resource", 100, 10, 1, 0.1)
    runner = FakeRunner()

    result = module.execute(tmp_path, request, runner)

    assert len(result["results"]) == 4
    assert all(item["continuity"]["path"] == "relay" for item in result["results"])
    assert all(item["resources"]["mediamtx"]["samples"] == 1 for item in result["results"])
    assert all(item["resources"]["turn"]["memoryMaxBytes"] == 12 * 1024 * 1024 for item in result["results"])
    assert all(item["resources"]["receiver"]["cpuP50Percent"] == 1.5 for item in result["results"])
    assert all(item["resources"]["receiver"]["cpuP95Percent"] == 1.5 for item in result["results"])
    assert ["docker", "network", "rm", "gcs-net-fixture-resource-net"] in runner.commands


def test_detached_receiver_retains_security_bounds_and_relay_policy() -> None:
    module = load_module()
    request = module.ResourceRequest("gcs-net-fixture-resource", 100, 10, 1, 0.1)

    command = module.detached_receiver_command(
        "gcs-net-fixture-resource-net",
        module.CONDITIONS[0],
        request,
        "gcs-net-fixture-resource-receiver",
    )

    assert "--rm" not in command
    assert command[command.index("--cap-add") + 1] == "NET_ADMIN"
    assert "RELAY_ONLY=1" in command
    assert "--read-only" in command
    assert "--detach" in command


@pytest.mark.parametrize(
    ("raw_value", "expected"),
    [("512KiB / 64MiB", 512 * 1024), ("12.5MiB / 128MiB", round(12.5 * 1024 * 1024)), ("1GB / 2GB", 10**9)],
)
def test_memory_parser_normalizes_units(raw_value: str, expected: int) -> None:
    module = load_module()

    assert module.memory_bytes(raw_value) == expected


def test_stats_parser_rejects_malformed_cpu_and_memory() -> None:
    module = load_module()

    with pytest.raises(ValueError):
        module.cpu_percent("1.2")
    with pytest.raises(ValueError):
        module.memory_bytes("unknown / 128MiB")


def test_resource_request_rejects_unbounded_sampling() -> None:
    module = load_module()

    with pytest.raises(ValueError):
        module.validate_request(module.ResourceRequest("gcs-net-fixture-resource", 100, 10, 61, 1))
    with pytest.raises(ValueError):
        module.validate_request(module.ResourceRequest("gcs-net-fixture-resource", 100, 10, 1, 0.01))
