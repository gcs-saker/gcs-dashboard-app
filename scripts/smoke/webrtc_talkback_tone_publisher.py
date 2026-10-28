#!/usr/bin/env python3
from __future__ import annotations

import argparse
import array
import asyncio
import fractions
import math
import time
from typing import Sequence

from webrtc_whip_publish_smoke import post_whip_offer, wait_for_ice_connected, wait_for_ice_gathering_complete

SAMPLE_RATE = 48_000
FRAME_DURATION_MS = 20
SAMPLES_PER_FRAME = SAMPLE_RATE * FRAME_DURATION_MS // 1000


def tone_samples(sequence: int, marker_epoch_ns: int, amplitude: float = 0.25) -> array.array[int]:
    if time.time_ns() < marker_epoch_ns:
        return array.array("h", [0] * SAMPLES_PER_FRAME)
    start = sequence * SAMPLES_PER_FRAME
    return array.array(
        "h",
        (
            round(amplitude * 32767 * math.sin(2 * math.pi * 1000 * (start + offset) / SAMPLE_RATE))
            for offset in range(SAMPLES_PER_FRAME)
        ),
    )


def create_track(marker_epoch_ns: int):  # type: ignore[no-untyped-def]
    from aiortc import AudioStreamTrack
    from av import AudioFrame

    class ToneTrack(AudioStreamTrack):
        def __init__(self) -> None:
            super().__init__()
            self.sequence = 0
            self.started = time.perf_counter()

        async def recv(self):  # type: ignore[no-untyped-def]
            target = self.started + self.sequence * FRAME_DURATION_MS / 1000
            delay = target - time.perf_counter()
            if delay > 0:
                await asyncio.sleep(delay)
            frame = AudioFrame(format="s16", layout="mono", samples=SAMPLES_PER_FRAME)
            frame.planes[0].update(tone_samples(self.sequence, marker_epoch_ns).tobytes())
            frame.sample_rate = SAMPLE_RATE
            frame.pts = self.sequence * SAMPLES_PER_FRAME
            frame.time_base = fractions.Fraction(1, SAMPLE_RATE)
            self.sequence += 1
            return frame

    return ToneTrack()


async def run(args: argparse.Namespace) -> None:
    from aiortc import RTCConfiguration, RTCIceServer, RTCPeerConnection, RTCSessionDescription

    peer = RTCPeerConnection(RTCConfiguration(iceServers=[RTCIceServer(urls=[args.ice_server_url])]))
    peer.addTrack(create_track(args.marker_epoch_ns))
    try:
        offer = await peer.createOffer()
        await peer.setLocalDescription(offer)
        await wait_for_ice_gathering_complete(peer, args.timeout_seconds)
        local = peer.localDescription
        if local is None:
            raise RuntimeError("talkback publisher offer is unavailable")
        answer = post_whip_offer(args.whip_url, local.sdp, False)
        await peer.setRemoteDescription(RTCSessionDescription(sdp=answer, type="answer"))
        await wait_for_ice_connected(peer, args.timeout_seconds)
        print("Talkback tone publisher connected", flush=True)
        await asyncio.sleep(args.publish_seconds)
    finally:
        await peer.close()


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--whip-url", required=True)
    parser.add_argument("--ice-server-url", required=True)
    parser.add_argument("--marker-epoch-ns", type=int, required=True)
    parser.add_argument("--publish-seconds", type=float, default=8)
    parser.add_argument("--timeout-seconds", type=float, default=10)
    args = parser.parse_args(argv)
    if args.marker_epoch_ns <= 0 or not 1 <= args.publish_seconds <= 30 or not 1 <= args.timeout_seconds <= 60:
        parser.error("talkback publisher bounds are invalid")
    return args


def main() -> int:
    try:
        asyncio.run(run(parse_args()))
        return 0
    except (OSError, RuntimeError, TimeoutError, asyncio.TimeoutError) as exc:
        print(f"Talkback tone publisher failed: {type(exc).__name__}")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
