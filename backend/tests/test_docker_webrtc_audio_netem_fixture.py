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
        if command[:2] == ["docker", "run"] and "--cap-add" in command:
            return json.dumps(
                {
                    "frames": 100,
                    "missing_frames": 0,
                    "first_audio_ms": 100,
                    "arrival_gap_p95_ms": 21,
                    "arrival_gap_max_ms": 24,
                    "media_gap_max_ms": 20,
                    "path": "direct",
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
