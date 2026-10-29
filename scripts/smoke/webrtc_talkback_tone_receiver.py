#!/usr/bin/env python3
from __future__ import annotations

import argparse
import array
import asyncio
import json
import math
import time
from dataclasses import asdict, dataclass
from typing import Sequence

from ice_pair_observation import enforce_aiortc_relay_policy, relay_only_sdp
from webrtc_ice_smoke import (
    collect_selected_ice_pair,
    post_whep_offer,
    wait_for_ice_connected,
    wait_for_ice_gathering_complete,
)


@dataclass(frozen=True)
class ToneReceipt:
    tone_latency_ms: float
    frames_before_tone: int
    arrival_gap_max_ms: float
    path: str


def pcm_rms(payload: bytes) -> float:
    samples = array.array("h")
    samples.frombytes(payload)
    return 0.0 if not samples else math.sqrt(sum(sample * sample for sample in samples) / len(samples))


async def detect_tone(track: object, args: argparse.Namespace, path: str) -> ToneReceipt:
    previous_arrival = None
    maximum_gap_ms = 0.0
    frames = 0
    async with asyncio.timeout(args.timeout_seconds):
        while True:
            frame = await track.recv()  # type: ignore[attr-defined]
            arrived = time.perf_counter()
            if previous_arrival is not None:
                maximum_gap_ms = max(maximum_gap_ms, (arrived - previous_arrival) * 1000)
            previous_arrival = arrived
            frames += 1
            if pcm_rms(bytes(frame.planes[0])) >= args.rms_threshold:  # type: ignore[attr-defined]
                latency_ms = (time.time_ns() - args.marker_epoch_ns) / 1_000_000
                return ToneReceipt(round(latency_ms, 3), frames - 1, round(maximum_gap_ms, 3), path)


async def run(args: argparse.Namespace) -> ToneReceipt:
    from aiortc import RTCConfiguration, RTCIceServer, RTCPeerConnection, RTCSessionDescription

    ice_server = RTCIceServer(
        urls=[args.ice_server_url],
        username=args.ice_username,
        credential=args.ice_credential,
    )
    peer = RTCPeerConnection(RTCConfiguration(iceServers=[ice_server]))
    tracks: asyncio.Queue[object] = asyncio.Queue()

    @peer.on("track")
    def on_track(track: object) -> None:
        if getattr(track, "kind", "") == "audio":
            tracks.put_nowait(track)

    try:
        peer.addTransceiver("audio", direction="recvonly")
        if args.relay_only:
            enforce_aiortc_relay_policy(peer)
        offer = await peer.createOffer()
        await peer.setLocalDescription(offer)
        await wait_for_ice_gathering_complete(peer, args.timeout_seconds)
        local = peer.localDescription
        if local is None:
            raise RuntimeError("talkback receiver offer is unavailable")
        offer_sdp = relay_only_sdp(local.sdp) if args.relay_only else local.sdp
        answer = post_whep_offer(args.whep_url, offer_sdp, False)
        await peer.setRemoteDescription(RTCSessionDescription(sdp=answer, type="answer"))
        await wait_for_ice_connected(peer, args.timeout_seconds)
        selected = await collect_selected_ice_pair(peer)
        expected_path = "relay" if args.relay_only else "direct"
        if selected is None or selected.path != expected_path:
            raise RuntimeError(f"talkback fixture requires {expected_path} ICE")
        track = await asyncio.wait_for(tracks.get(), timeout=args.timeout_seconds)
        return await detect_tone(track, args, selected.path)
    finally:
        await peer.close()


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--whep-url", required=True)
    parser.add_argument("--ice-server-url", required=True)
    parser.add_argument("--ice-username")
    parser.add_argument("--ice-credential")
    parser.add_argument("--relay-only", action="store_true")
    parser.add_argument("--marker-epoch-ns", type=int, required=True)
    parser.add_argument("--rms-threshold", type=float, default=1000)
    parser.add_argument("--timeout-seconds", type=float, default=10)
    args = parser.parse_args(argv)
    if bool(args.ice_username) != bool(args.ice_credential):
        parser.error("ICE username and credential must be provided together")
    if args.relay_only and not args.ice_username:
        parser.error("relay-only Talkback requires TURN credentials")
    if args.marker_epoch_ns <= 0 or not 1 <= args.rms_threshold <= 32767 or not 1 <= args.timeout_seconds <= 60:
        parser.error("talkback receiver bounds are invalid")
    return args


def main() -> int:
    try:
        print(json.dumps(asdict(asyncio.run(run(parse_args()))), separators=(",", ":")))
        return 0
    except (OSError, RuntimeError, TimeoutError, asyncio.TimeoutError) as exc:
        print(json.dumps({"status": "FAIL", "errorCode": type(exc).__name__}, separators=(",", ":")))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
