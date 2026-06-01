#!/usr/bin/env python3
"""Smoke-test WebRTC WHEP signaling and ICE candidate exchange."""

from __future__ import annotations

import argparse
import asyncio
from dataclasses import dataclass
import ssl
import sys
import time
from typing import Sequence
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


DEFAULT_WHEP_URL = "http://127.0.0.1:8889/raw/sample/front/whep"
DEFAULT_STUN_URL = "stun:localhost:3478"
REQUIRED_SDP_MARKERS = ("ice-ufrag", "ice-pwd", "fingerprint")
CONNECTED_ICE_STATES = {"connected", "completed"}
FAILED_ICE_STATES = {"failed", "closed", "disconnected"}


@dataclass(frozen=True)
class SdpInspection:
    has_ice_ufrag: bool
    has_ice_pwd: bool
    has_fingerprint: bool
    candidate_count: int
    has_video_media: bool
    has_audio_media: bool

    @property
    def is_webrtc_ready(self) -> bool:
        return (
            self.has_ice_ufrag
            and self.has_ice_pwd
            and self.has_fingerprint
            and self.candidate_count > 0
        )


def inspect_sdp(sdp: str) -> SdpInspection:
    lines = [line.strip() for line in sdp.splitlines()]
    return SdpInspection(
        has_ice_ufrag=any(line.startswith("a=ice-ufrag:") for line in lines),
        has_ice_pwd=any(line.startswith("a=ice-pwd:") for line in lines),
        has_fingerprint=any(line.startswith("a=fingerprint:") for line in lines),
        candidate_count=sum(1 for line in lines if line.startswith("a=candidate:")),
        has_video_media=any(line.startswith("m=video ") for line in lines),
        has_audio_media=any(line.startswith("m=audio ") for line in lines),
    )


def require_webrtc_sdp(sdp: str, label: str) -> SdpInspection:
    inspection = inspect_sdp(sdp)
    missing = []
    if not inspection.has_ice_ufrag:
        missing.append("a=ice-ufrag")
    if not inspection.has_ice_pwd:
        missing.append("a=ice-pwd")
    if not inspection.has_fingerprint:
        missing.append("a=fingerprint")
    if inspection.candidate_count == 0:
        missing.append("a=candidate")

    if missing:
        raise RuntimeError(f"{label} SDP is missing WebRTC ICE data: {', '.join(missing)}")

    return inspection


def post_whep_offer(whep_url: str, offer_sdp: str, insecure: bool) -> str:
    context = ssl._create_unverified_context() if insecure else None
    request = Request(
        whep_url,
        data=offer_sdp.encode("utf-8"),
        headers={
            "Accept": "application/sdp",
            "Content-Type": "application/sdp",
        },
        method="POST",
    )

    try:
        with urlopen(request, timeout=15, context=context) as response:
            status = getattr(response, "status", None)
            payload = response.read().decode("utf-8")
    except HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"WHEP answer request failed with HTTP {error.code}: {detail}") from error
    except URLError as error:
        raise RuntimeError(f"WHEP answer request failed: {error.reason}") from error

    if status and status >= 400:
        raise RuntimeError(f"WHEP answer request failed with HTTP {status}")
    if not payload.strip():
        raise RuntimeError("WHEP answer response was empty")
    return payload


async def wait_for_ice_gathering_complete(peer_connection: object, timeout_seconds: float) -> None:
    if getattr(peer_connection, "iceGatheringState") == "complete":
        return

    complete = asyncio.Event()

    @peer_connection.on("icegatheringstatechange")  # type: ignore[attr-defined]
    def on_ice_gathering_state_change() -> None:
        if getattr(peer_connection, "iceGatheringState") == "complete":
            complete.set()

    await asyncio.wait_for(complete.wait(), timeout=timeout_seconds)


async def wait_for_ice_connected(peer_connection: object, timeout_seconds: float) -> None:
    current_state = str(getattr(peer_connection, "iceConnectionState"))
    if current_state in CONNECTED_ICE_STATES:
        return

    connected = asyncio.Event()
    failed_state: list[str] = []

    @peer_connection.on("iceconnectionstatechange")  # type: ignore[attr-defined]
    def on_ice_connection_state_change() -> None:
        state = str(getattr(peer_connection, "iceConnectionState"))
        if state in CONNECTED_ICE_STATES:
            connected.set()
        elif state in FAILED_ICE_STATES:
            failed_state.append(state)
            connected.set()

    await asyncio.wait_for(connected.wait(), timeout=timeout_seconds)

    if failed_state:
        raise RuntimeError(f"ICE connection failed with state={failed_state[-1]}")

    final_state = str(getattr(peer_connection, "iceConnectionState"))
    if final_state not in CONNECTED_ICE_STATES:
        raise RuntimeError(f"ICE connection did not reach connected/completed: state={final_state}")


async def wait_for_video_frame(track_queue: asyncio.Queue[object], timeout_seconds: float) -> object:
    track = await asyncio.wait_for(track_queue.get(), timeout=timeout_seconds)
    return await asyncio.wait_for(track.recv(), timeout=timeout_seconds)  # type: ignore[attr-defined]


async def run_webrtc_smoke(args: argparse.Namespace) -> int:
    try:
        from aiortc import RTCConfiguration, RTCIceServer, RTCPeerConnection, RTCSessionDescription
    except ImportError as error:
        raise RuntimeError("aiortc is required for --run. Install with: python -m pip install aiortc") from error

    peer_connection = RTCPeerConnection(
        RTCConfiguration(iceServers=[RTCIceServer(urls=[args.stun_url])]),
    )
    video_tracks: asyncio.Queue[object] = asyncio.Queue()

    @peer_connection.on("track")  # type: ignore[attr-defined]
    def on_track(track: object) -> None:
        if getattr(track, "kind", "") == "video":
            video_tracks.put_nowait(track)

    try:
        peer_connection.addTransceiver("video", direction="recvonly")

        started = time.perf_counter()
        offer = await peer_connection.createOffer()
        await peer_connection.setLocalDescription(offer)
        await wait_for_ice_gathering_complete(peer_connection, args.timeout_seconds)

        local_description = peer_connection.localDescription
        if not local_description or not local_description.sdp:
            raise RuntimeError("Local WebRTC offer SDP was not created")

        local_inspection = require_webrtc_sdp(local_description.sdp, "local offer")
        offer_ready_elapsed_ms = (time.perf_counter() - started) * 1000
        answer_sdp = post_whep_offer(args.whep_url, local_description.sdp, args.insecure)
        answer_elapsed_ms = (time.perf_counter() - started) * 1000
        answer_inspection = require_webrtc_sdp(answer_sdp, "WHEP answer")

        await peer_connection.setRemoteDescription(
            RTCSessionDescription(sdp=answer_sdp, type="answer"),
        )

        if args.require_connected or args.require_video_frame:
            await wait_for_ice_connected(peer_connection, args.timeout_seconds)
        else:
            await asyncio.sleep(0.2)

        frame = None
        first_frame_elapsed_ms = None
        if args.require_video_frame:
            frame = await wait_for_video_frame(video_tracks, args.timeout_seconds)
            first_frame_elapsed_ms = (time.perf_counter() - started) * 1000

        print("WebRTC ICE smoke run passed")
        print(f"WHEP URL: {args.whep_url}")
        print(f"STUN URL: {args.stun_url}")
        print(f"Local offer candidates: {local_inspection.candidate_count}")
        print(f"WHEP answer candidates: {answer_inspection.candidate_count}")
        print(f"Local offer ready ms: {offer_ready_elapsed_ms:.1f}")
        print(f"WHEP answer latency ms: {answer_elapsed_ms:.1f}")
        print(f"ICE gathering state: {peer_connection.iceGatheringState}")
        print(f"ICE connection state: {peer_connection.iceConnectionState}")
        if frame is not None and first_frame_elapsed_ms is not None:
            print(f"First video frame latency ms: {first_frame_elapsed_ms:.1f}")
            print(f"First video frame size: {frame.width}x{frame.height}")  # type: ignore[attr-defined]
        return 0
    finally:
        await peer_connection.close()


def run_static_check() -> int:
    sample_sdp = "\r\n".join(
        [
            "v=0",
            "o=- 0 0 IN IP4 127.0.0.1",
            "s=-",
            "t=0 0",
            "a=ice-ufrag:sampleUfrag",
            "a=ice-pwd:samplePassword",
            "a=fingerprint:sha-256 00:11:22:33",
            "m=video 9 UDP/TLS/RTP/SAVPF 96",
            "a=candidate:1 1 udp 2130706431 127.0.0.1 8189 typ host",
        ]
    )
    inspection = require_webrtc_sdp(sample_sdp, "sample")
    if not inspection.has_video_media:
        raise RuntimeError("sample SDP should include a video media section")

    print("WebRTC ICE smoke check passed")
    print(f"Required SDP markers: {', '.join(REQUIRED_SDP_MARKERS)}, candidate")
    print(f"Default WHEP URL: {DEFAULT_WHEP_URL}")
    print(f"Default STUN URL: {DEFAULT_STUN_URL}")
    return 0


def parse_args(argv: Sequence[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Validate WHEP offer/answer SDP and optional ICE connected state.",
    )
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--check", action="store_true", help="Run static SDP/parser contract checks.")
    mode.add_argument("--run", action="store_true", help="Run a live WHEP/ICE smoke test with aiortc.")
    parser.add_argument("--whep-url", default=DEFAULT_WHEP_URL)
    parser.add_argument("--stun-url", default=DEFAULT_STUN_URL)
    parser.add_argument("--timeout-seconds", type=float, default=15)
    parser.add_argument("--insecure", action="store_true", help="Allow self-signed HTTPS WHEP endpoints.")
    parser.add_argument(
        "--require-connected",
        action="store_true",
        help="Fail unless ICE reaches connected/completed after applying the WHEP answer.",
    )
    parser.add_argument(
        "--require-video-frame",
        action="store_true",
        help="Fail unless a decoded remote video frame is received.",
    )
    args = parser.parse_args(argv)
    if not args.check and not args.run:
        args.check = True
    return args


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(sys.argv[1:] if argv is None else argv)
    try:
        if args.check:
            return run_static_check()
        return asyncio.run(run_webrtc_smoke(args))
    except Exception as error:
        print(f"WebRTC ICE smoke failed: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
