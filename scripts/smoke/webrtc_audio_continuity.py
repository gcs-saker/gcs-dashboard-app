#!/usr/bin/env python3
from __future__ import annotations

import argparse
import asyncio
import json
import math
import time
from dataclasses import dataclass
from typing import Sequence

from ice_pair_observation import enforce_aiortc_relay_policy, relay_only_sdp
from webrtc_ice_smoke import (
    collect_selected_ice_pair,
    post_whep_offer,
    require_webrtc_sdp,
    wait_for_ice_connected,
    wait_for_ice_gathering_complete,
)


@dataclass(frozen=True)
class AudioContinuity:
    frames: int
    missing_frames: int
    expected_frame_ms: float
    first_audio_ms: float
    arrival_gap_p95_ms: float
    arrival_gap_max_ms: float
    media_gap_max_ms: float
    path: str


@dataclass(frozen=True)
class ReceiveRequest:
    frames: int
    started: float
    timeout_seconds: float
    path: str


def percentile(values: list[float], percent: int) -> float:
    ordered = sorted(values)
    index = max(0, math.ceil(len(ordered) * percent / 100) - 1)
    return round(ordered[index], 3)


def media_time_ms(frame: object) -> float | None:
    pts = getattr(frame, "pts", None)
    time_base = getattr(frame, "time_base", None)
    return None if pts is None or time_base is None else float(pts) * float(time_base) * 1000


def frame_duration_ms(frame: object) -> float:
    samples = int(getattr(frame, "samples", 0))
    sample_rate = int(getattr(frame, "sample_rate", 0))
    if samples <= 0 or sample_rate <= 0:
        raise RuntimeError("decoded audio frame duration is unavailable")
    return samples / sample_rate * 1000


async def receive_audio(track: object, request: ReceiveRequest) -> AudioContinuity:
    arrival_gaps: list[float] = []
    media_gaps: list[float] = []
    missing = 0
    previous_arrival = None
    previous_media = None
    expected = 0.0
    first_audio_ms = 0.0
    async with asyncio.timeout(request.timeout_seconds):
        for index in range(request.frames):
            frame = await track.recv()  # type: ignore[attr-defined]
            arrived = time.perf_counter()
            if index == 0:
                first_audio_ms = (arrived - request.started) * 1000
                expected = frame_duration_ms(frame)
            if previous_arrival is not None:
                arrival_gaps.append((arrived - previous_arrival) * 1000)
            current_media = media_time_ms(frame)
            if previous_media is not None and current_media is not None:
                media_gap = current_media - previous_media
                media_gaps.append(media_gap)
                missing += max(0, round(media_gap / expected) - 1)
            previous_arrival = arrived
            previous_media = current_media
    return AudioContinuity(
        frames=request.frames,
        missing_frames=missing,
        expected_frame_ms=round(expected, 3),
        first_audio_ms=round(first_audio_ms, 3),
        arrival_gap_p95_ms=percentile(arrival_gaps, 95),
        arrival_gap_max_ms=round(max(arrival_gaps), 3),
        media_gap_max_ms=round(max(media_gaps), 3) if media_gaps else 0.0,
        path=request.path,
    )


async def run(args: argparse.Namespace) -> AudioContinuity:
    from aiortc import RTCConfiguration, RTCIceServer, RTCPeerConnection, RTCSessionDescription

    ice_server = RTCIceServer(
        urls=[args.ice_server_url],
        username=args.ice_username,
        credential=args.ice_credential,
    )
    peer = RTCPeerConnection(RTCConfiguration(iceServers=[ice_server]))
    audio_tracks: asyncio.Queue[object] = asyncio.Queue()

    @peer.on("track")
    def on_track(track: object) -> None:
        if getattr(track, "kind", "") == "audio":
            audio_tracks.put_nowait(track)

    try:
        peer.addTransceiver("audio", direction="recvonly")
        if args.relay_only:
            enforce_aiortc_relay_policy(peer)
        started = time.perf_counter()
        offer = await peer.createOffer()
        await peer.setLocalDescription(offer)
        await wait_for_ice_gathering_complete(peer, args.timeout_seconds)
        local = peer.localDescription
        if local is None:
            raise RuntimeError("audio continuity offer is unavailable")
        require_webrtc_sdp(local.sdp, "audio continuity offer")
        offer_sdp = relay_only_sdp(local.sdp) if args.relay_only else local.sdp
        answer = post_whep_offer(args.whep_url, offer_sdp, False)
        await peer.setRemoteDescription(RTCSessionDescription(sdp=answer, type="answer"))
        await wait_for_ice_connected(peer, args.timeout_seconds)
        selected = await collect_selected_ice_pair(peer)
        expected_path = "relay" if args.relay_only else "direct"
        if selected is None or selected.path != expected_path:
            raise RuntimeError(f"audio continuity fixture requires {expected_path} ICE")
        track = await asyncio.wait_for(audio_tracks.get(), timeout=args.timeout_seconds)
        request = ReceiveRequest(args.frames, started, args.timeout_seconds, selected.path)
        return await receive_audio(track, request)
    finally:
        await peer.close()


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--whep-url", required=True)
    parser.add_argument("--ice-server-url", required=True)
    parser.add_argument("--ice-username")
    parser.add_argument("--ice-credential")
    parser.add_argument("--relay-only", action="store_true")
    parser.add_argument("--frames", type=int, default=100)
    parser.add_argument("--timeout-seconds", type=float, default=10)
    args = parser.parse_args(argv)
    if bool(args.ice_username) != bool(args.ice_credential):
        parser.error("ICE username and credential must be provided together")
    if args.relay_only and not args.ice_username:
        parser.error("relay-only audio continuity requires TURN credentials")
    if not 2 <= args.frames <= 3000 or not 1 <= args.timeout_seconds <= 120:
        parser.error("audio continuity bounds are invalid")
    if args.timeout_seconds < args.frames / 50 + 5:
        parser.error("audio continuity timeout is too short for the requested frames")
    return args


def main() -> int:
    try:
        result = asyncio.run(run(parse_args()))
        print(json.dumps(result.__dict__, separators=(",", ":")))
        return 0
    except (OSError, RuntimeError, TimeoutError, asyncio.TimeoutError) as exc:
        print(json.dumps({"status": "FAIL", "errorCode": type(exc).__name__}, separators=(",", ":")))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
