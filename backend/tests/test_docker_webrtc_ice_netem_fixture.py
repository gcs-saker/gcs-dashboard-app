import importlib.util
import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts/benchmarks/docker_webrtc_ice_netem_fixture.py"


def load_module():
    scripts = str(ROOT / "scripts/benchmarks")
    if scripts not in sys.path:
        sys.path.insert(0, scripts)
    spec = importlib.util.spec_from_file_location("docker_webrtc_ice_netem_fixture", SCRIPT)
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
            return json.dumps({"iceConnectedMs": 12, "signalingMs": 3, "path": "direct"})
        return "fixture-id"


def test_webrtc_matrix_connects_each_condition_and_cleans_up(tmp_path: Path) -> None:
    module = load_module()
    config = tmp_path / "deploy/network/mediamtx.webrtc-fixture.yml"
    config.parent.mkdir(parents=True)
    config.write_text("paths: {all: {source: publisher}}\n")
    runner = FakeRunner()

    result = module.execute(tmp_path, "gcs-net-fixture-webrtc", 2, runner)

    assert len(result["results"]) == 4
    assert all(item["metrics"]["connected"] == 2 for item in result["results"])
    assert ["docker", "rm", "--force", "gcs-net-fixture-webrtc-publisher"] in runner.commands
    assert ["docker", "rm", "--force", "gcs-net-fixture-webrtc-turn"] in runner.commands
    assert ["docker", "network", "rm", "gcs-net-fixture-webrtc-net"] in runner.commands


def test_webrtc_fixture_is_pinned_bounded_and_local_only() -> None:
    module = load_module()
    media = module.mediamtx_command("gcs-net-fixture-webrtc-net", "mediamtx", Path("config"))
    publisher = module.publisher_command("gcs-net-fixture-webrtc-net", "publisher")
    receiver = module.receiver_command("gcs-net-fixture-webrtc-net", module.CONDITIONS[0])

    assert "@sha256:" in module.MEDIAMTX_IMAGE
    assert media[media.index("--cap-drop") + 1] == "ALL"
    assert publisher[publisher.index("--cap-drop") + 1] == "ALL"
    assert receiver[receiver.index("--cap-add") + 1] == "NET_ADMIN"
    assert "--require-selected-pair" in publisher
    assert "stun:turn:3478" in publisher


def test_webrtc_probe_dependencies_are_exactly_pinned() -> None:
    requirements = (ROOT / "deploy/network/webrtc-probe-requirements.txt").read_text().splitlines()

    assert requirements
    assert all(
        "==" in requirement and not any(marker in requirement for marker in (">", "<", "~="))
        for requirement in requirements
    )


@pytest.mark.parametrize("samples", [0, 6])
def test_webrtc_fixture_rejects_unbounded_samples(samples: int) -> None:
    module = load_module()

    with pytest.raises(ValueError):
        module.validate("gcs-net-fixture-webrtc", "local-fixture", samples)


def test_webrtc_summary_separates_paths_and_failures() -> None:
    module = load_module()
    observations = [
        {"iceConnectedMs": 10, "signalingMs": 2, "path": "direct"},
        {"iceConnectedMs": 20, "signalingMs": 3, "path": "direct"},
        {"path": "unknown"},
    ]

    result = module.summarize(observations, 3)

    assert result["connected"] == 2
    assert result["failures"] == 1
    assert result["paths"] == {"direct": 2, "relay": 0, "unknown": 1}
    assert result["iceConnectedMs"]["p95"] == 20.0
