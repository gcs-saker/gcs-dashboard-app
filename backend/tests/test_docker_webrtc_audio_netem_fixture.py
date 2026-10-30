import importlib.util
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts/benchmarks/docker_webrtc_audio_netem_fixture.py"


def load_module():
    scripts = str(ROOT / "scripts/benchmarks")
    if scripts not in sys.path:
        sys.path.insert(0, scripts)
    spec = importlib.util.spec_from_file_location("docker_webrtc_audio_netem_fixture", SCRIPT)
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
        if command[:2] == ["docker", "run"] and "NET_ADMIN" in command:
            frame_value = next(value for value in command if value.startswith("AUDIO_FRAMES="))
            path = "relay" if "RELAY_ONLY=1" in command else "direct"
            return json.dumps(
                {
                    "frames": int(frame_value.split("=", 1)[1]),
                    "missing_frames": 0,
                    "first_audio_ms": 100,
                    "arrival_gap_p95_ms": 21,
                    "arrival_gap_max_ms": 24,
                    "media_gap_max_ms": 20,
                    "path": path,
                },
            )
        return "fixture-id"


def test_audio_matrix_collects_continuity_and_cleans_up(tmp_path: Path) -> None:
    module = load_module()
    config = tmp_path / "deploy/network/mediamtx.webrtc-fixture.yml"
    config.parent.mkdir(parents=True)
    config.write_text("paths: {all: {source: publisher}}\n")
    runner = FakeRunner()

    result = module.execute(tmp_path, "gcs-net-fixture-audio", 2, runner)

    assert len(result["results"]) == 4
    assert all(item["metrics"]["complete"] == 2 for item in result["results"])
    assert all(item["metrics"]["minimumFrames"] == 100 for item in result["results"])
    assert ["docker", "network", "rm", "gcs-net-fixture-audio-net"] in runner.commands


def test_audio_summary_exposes_missing_frames_and_gaps() -> None:
    module = load_module()
    sample = {
        "frames": 100,
        "missing_frames": 2,
        "first_audio_ms": 100,
        "arrival_gap_p95_ms": 21,
        "arrival_gap_max_ms": 50,
        "media_gap_max_ms": 40,
        "path": "direct",
    }

    result = module.summarize([sample, sample], 2)

    assert result["totalMissingFrames"] == 4
    assert result["arrivalGapMaxP95Ms"] == 50
    assert result["mediaGapMaxP95Ms"] == 40
    assert result["directPaths"] == 2


def test_relay_audio_soak_requires_relay_path_and_requested_frames(tmp_path: Path) -> None:
    module = load_module()
    config = tmp_path / "deploy/network/mediamtx.webrtc-fixture.yml"
    config.parent.mkdir(parents=True)
    config.write_text("paths: {all: {source: publisher}}\n")
    runner = FakeRunner()
    request = module.FixtureRequest("gcs-net-fixture-audio-relay", 1, 1000, 30, True)

    result = module.run_fixture(tmp_path, request, runner)

    assert result["schemaVersion"] == "gcs-saker.webrtc-audio-relay-netem-fixture.v1"
    assert all(item["metrics"]["minimumFrames"] == 1000 for item in result["results"])
    assert all(item["metrics"]["relayPaths"] == 1 for item in result["results"])
    probes = [command for command in runner.commands if "RELAY_ONLY=1" in command]
    assert all("TURN_USER=gcs-fixture" in command for command in probes)
    assert all(command[command.index("--cap-add") + 1] == "NET_ADMIN" for command in probes)


def test_audio_soak_rejects_unbounded_or_impossible_requests() -> None:
    module = load_module()

    for request in (
        module.FixtureRequest("gcs-net-fixture-audio", 1, 1, 10, False),
        module.FixtureRequest("gcs-net-fixture-audio", 1, 3001, 120, False),
        module.FixtureRequest("gcs-net-fixture-audio", 1, 1000, 20, True),
    ):
        try:
            module.validate_request(request)
        except ValueError:
            continue
        raise AssertionError("invalid audio soak request was accepted")
