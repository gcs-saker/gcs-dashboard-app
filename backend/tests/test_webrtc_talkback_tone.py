import array
import importlib.util
import sys
import time
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]


def load_module(name: str):
    smoke = str(ROOT / "scripts/smoke")
    if smoke not in sys.path:
        sys.path.insert(0, smoke)
    path = ROOT / f"scripts/smoke/{name}.py"
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def test_tone_samples_are_silent_before_marker_and_audible_after_marker() -> None:
    publisher = load_module("webrtc_talkback_tone_publisher")
    receiver = load_module("webrtc_talkback_tone_receiver")

    silence = publisher.tone_samples(0, time.time_ns() + 1_000_000_000)
    tone = publisher.tone_samples(1, time.time_ns() - 1)

    assert receiver.pcm_rms(silence.tobytes()) == 0
    assert receiver.pcm_rms(tone.tobytes()) > 5_000


def test_pcm_rms_handles_empty_and_maximum_samples() -> None:
    receiver = load_module("webrtc_talkback_tone_receiver")

    assert receiver.pcm_rms(b"") == 0
    payload = array.array("h", [32767, -32768]).tobytes()
    assert receiver.pcm_rms(payload) == pytest.approx(32767.5, abs=0.5)


@pytest.mark.parametrize("value", [0, 32768])
def test_receiver_rejects_out_of_range_rms_threshold(value: int) -> None:
    receiver = load_module("webrtc_talkback_tone_receiver")

    with pytest.raises(SystemExit):
        receiver.parse_args(
            [
                "--whep-url",
                "http://fixture/whep",
                "--ice-server-url",
                "stun:fixture",
                "--marker-epoch-ns",
                "1",
                "--rms-threshold",
                str(value),
            ],
        )
