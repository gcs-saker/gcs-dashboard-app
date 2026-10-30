import asyncio
import importlib.util
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts/smoke/webrtc_audio_continuity.py"


def load_module():
    smoke = str(ROOT / "scripts/smoke")
    if smoke not in sys.path:
        sys.path.insert(0, smoke)
    spec = importlib.util.spec_from_file_location("webrtc_audio_continuity", SCRIPT)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def test_receive_audio_counts_media_timeline_gaps() -> None:
    module = load_module()

    class Frame:
        samples = 960
        sample_rate = 48000
        time_base = 1 / 48000

        def __init__(self, pts: int) -> None:
            self.pts = pts

    class Track:
        def __init__(self) -> None:
            self.frames = iter((Frame(0), Frame(960), Frame(2880)))

        async def recv(self):
            return next(self.frames)

    request = module.ReceiveRequest(3, module.time.perf_counter(), 1, "direct")
    result = asyncio.run(module.receive_audio(Track(), request))

    assert result.frames == 3
    assert result.expected_frame_ms == 20
    assert result.missing_frames == 1
    assert result.media_gap_max_ms == 40


@pytest.mark.parametrize(("frames", "timeout"), [(1, 10), (3001, 70), (100, 0), (100, 121), (1000, 20)])
def test_audio_continuity_rejects_invalid_bounds(frames: int, timeout: int) -> None:
    module = load_module()

    with pytest.raises(SystemExit):
        module.parse_args(
            [
                "--whep-url",
                "http://fixture/whep",
                "--ice-server-url",
                "stun:fixture:3478",
                "--frames",
                str(frames),
                "--timeout-seconds",
                str(timeout),
            ],
        )


def test_relay_continuity_requires_complete_turn_credentials() -> None:
    module = load_module()

    with pytest.raises(SystemExit):
        module.parse_args(
            [
                "--whep-url",
                "http://fixture/whep",
                "--ice-server-url",
                "turn:fixture:3478",
                "--ice-username",
                "fixture-user",
                "--frames",
                "1000",
                "--timeout-seconds",
                "30",
                "--relay-only",
            ],
        )


def test_relay_continuity_accepts_long_bounded_sample() -> None:
    module = load_module()

    args = module.parse_args(
        [
            "--whep-url",
            "http://fixture/whep",
            "--ice-server-url",
            "turn:fixture:3478",
            "--ice-username",
            "fixture-user",
            "--ice-credential",
            "fixture-credential",
            "--frames",
            "1000",
            "--timeout-seconds",
            "30",
            "--relay-only",
        ],
    )

    assert args.frames == 1000
    assert args.relay_only is True
