import importlib.util
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts/benchmarks/docker_webrtc_media_netem_fixture.py"


def load_module():
    scripts = str(ROOT / "scripts/benchmarks")
    if scripts not in sys.path:
        sys.path.insert(0, scripts)
    spec = importlib.util.spec_from_file_location("docker_webrtc_media_netem_fixture", SCRIPT)
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
                    "iceConnectedMs": 40,
                    "videoFrameMs": 120,
                    "audioFrameMs": 100,
                    "avSyncMs": 20,
                    "iceToVideoMs": 80,
                    "keyframeIntervalMs": 1000,
                    "path": "direct",
                },
            )
        return "fixture-id"


def test_media_matrix_decodes_audio_video_and_cleans_up(tmp_path: Path) -> None:
    module = load_module()
    config = tmp_path / "deploy/network/mediamtx.webrtc-fixture.yml"
    config.parent.mkdir(parents=True)
    config.write_text("paths: {all: {source: publisher}}\n")
    runner = FakeRunner()

    result = module.execute(tmp_path, "gcs-net-fixture-media", 2, runner)

    assert len(result["results"]) == 4
    assert all(item["metrics"]["decoded"] == 2 for item in result["results"])
    assert all(item["metrics"]["keyframesObserved"] == 2 for item in result["results"])
    assert ["docker", "network", "rm", "gcs-net-fixture-media-net"] in runner.commands


def test_media_receiver_requires_frames_sync_keyframe_and_continuity() -> None:
    module = load_module()

    assert "--measure-audio-video-sync" in module.MEDIA_RECEIVER_SCRIPT
    assert "--measure-keyframe-interval" in module.MEDIA_RECEIVER_SCRIPT
    command = module.receiver_command("gcs-net-fixture-media-net", module.CONDITIONS[0])
    assert command[command.index("--cap-add") + 1] == "NET_ADMIN"


def test_media_summary_fails_incomplete_samples() -> None:
    module = load_module()
    complete = {
        "videoFrameMs": 120,
        "audioFrameMs": 100,
        "avSyncMs": 20,
        "iceToVideoMs": 80,
        "keyframeIntervalMs": 1000,
        "path": "direct",
    }

    result = module.summarize([complete, {"path": "unknown"}], 2)

    assert result["decoded"] == 1
    assert result["failures"] == 1
    assert result["keyframesObserved"] == 1
