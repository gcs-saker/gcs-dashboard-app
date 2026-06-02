#!/usr/bin/env python3
"""Publish a synthetic video track through WHIP for external NAT smoke tests."""

from __future__ import annotations

import argparse
import asyncio
from dataclasses import dataclass
import fractions
import ssl
import sys
import time
from typing import Sequence
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


DEFAULT_WHIP_URL = "https://a4ai.tplinkdns.com/webrtc/raw/nat/smoke/whip"
DEFAULT_ICE_SERVER_URL = "stun:a4ai.tplinkdns.com:3478"
CONNECTED_ICE_STATES = {"connected", "completed"}
FAILED_ICE_STATES = {"failed", "closed", "disconnected"}


@dataclass(frozen=True)
class PublishTiming:
    offer_ready_ms: float
    whip_answer_ms: float
    connected_ms: float | None


def post_whip_offer(whip_url: str, offer_sdp: str, insecure: bool) -> str:
    context = ssl._create_unverified_context() if insecure else None
    request = Request(
        whip_url,
        data=offer_sdp.encode("utf-8"),
        headers={"Accept": "application/sdp", "Content-Type": "application/sdp"},
        method="POST",
    )
    try:
        with urlopen(request, timeout=15, context=context) as response:
            status = getattr(response, "status", None)
            payload = response.read().decode("utf-8")
    except HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"WHIP publish failed with HTTP {error.code}: {detail}") from error
    except URLError as error:
        raise RuntimeError(f"WHIP publish failed: {error.reason}") from error

    if status and status >= 400:
        raise RuntimeError(f"WHIP publish failed with HTTP {status}")
    if not payload.strip():
        raise RuntimeError("WHIP answer response was empty")
    return payload


async def wait_for_ice_gathering_complete(peer_connection: object, timeout_seconds: float) -> None:
    if getattr(peer_connection, "iceGatheringState") == "complete":
        return
    complete = asyncio.Event()

    @peer_connection.on("icegatheringstatechange")  # type: ignore[attr-defined]
    def on_ice_gathering_state_change() -> None:
        if getattr(peer_connection, "iceGatheringState") == "complete":
            complete.set()

    try:
        await asyncio.wait_for(complete.wait(), timeout=timeout_seconds)
    except asyncio.TimeoutError:
        return


async def wait_for_ice_connected(peer_connection: object, timeout_seconds: float) -> None:
    if str(getattr(peer_connection, "iceConnectionState")) in CONNECTED_ICE_STATES:
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

    try:
        await asyncio.wait_for(connected.wait(), timeout=timeout_seconds)
    except asyncio.TimeoutError as error:
        final_state = str(getattr(peer_connection, "iceConnectionState"))
        raise RuntimeError(
            f"ICE connection did not reach connected/completed within {timeout_seconds}s: state={final_state}"
        ) from error
    if failed_state:
        raise RuntimeError(f"ICE connection failed with state={failed_state[-1]}")


class SyntheticVideoTrack:  # aiortc VideoStreamTrack subclass at runtime.
    def __init__(self, width: int, height: int, fps: int) -> None:
        from aiortc import VideoStreamTrack

        class _Track(VideoStreamTrack):
            def __init__(self, outer: "SyntheticVideoTrack") -> None:
                super().__init__()
                self.outer = outer

            async def recv(self):  # type: ignore[no-untyped-def]
                return await self.outer.recv()

        self._track = _Track(self)
        self.width = width
        self.height = height
        self.fps = fps
        self.sequence = 0
        self.started_at = time.perf_counter()

    @property
    def track(self):  # type: ignore[no-untyped-def]
        return self._track

    async def recv(self):  # type: ignore[no-untyped-def]
        from av import VideoFrame

        frame_interval = 1 / self.fps
        target = self.started_at + (self.sequence * frame_interval)
        delay = target - time.perf_counter()
        if delay > 0:
            await asyncio.sleep(delay)

        frame = VideoFrame(width=self.width, height=self.height, format="yuv420p")
        luminance = (self.sequence * 7) % 220
        for index, plane in enumerate(frame.planes):
            value = luminance if index == 0 else 128
            plane.update(bytes([value]) * plane.buffer_size)
        frame.pts = self.sequence
        frame.time_base = fractions.Fraction(1, self.fps)
        self.sequence += 1
        return frame


async def run_publish_smoke(args: argparse.Namespace) -> int:
    try:
        from aiortc import RTCConfiguration, RTCIceServer, RTCPeerConnection, RTCSessionDescription
    except ImportError as error:
        raise RuntimeError("aiortc is required for --run. Install with: python -m pip install aiortc") from error

    peer_connection = RTCPeerConnection(
        RTCConfiguration(
            iceServers=[
                RTCIceServer(
                    urls=[args.ice_server_url],
                    username=args.ice_username,
                    credential=args.ice_credential,
                )
            ]
        )
    )
    track = SyntheticVideoTrack(args.width, args.height, args.fps)
    peer_connection.addTrack(track.track)
    started = time.perf_counter()
    connected_ms: float | None = None

    try:
        offer = await peer_connection.createOffer()
        await peer_connection.setLocalDescription(offer)
        await wait_for_ice_gathering_complete(peer_connection, args.timeout_seconds)
        local_description = peer_connection.localDescription
        if not local_description or not local_description.sdp:
            raise RuntimeError("Local WHIP offer SDP was not created")
        offer_ready_ms = (time.perf_counter() - started) * 1000
        answer_sdp = post_whip_offer(args.whip_url, local_description.sdp, args.insecure)
        answer_ms = (time.perf_counter() - started) * 1000
        await peer_connection.setRemoteDescription(RTCSessionDescription(sdp=answer_sdp, type="answer"))
        if args.require_connected:
            await wait_for_ice_connected(peer_connection, args.timeout_seconds)
            connected_ms = (time.perf_counter() - started) * 1000
        await asyncio.sleep(args.publish_seconds)

        print("WebRTC WHIP publish smoke run passed")
        print(f"WHIP URL: {args.whip_url}")
        print(f"ICE server URL: {args.ice_server_url}")
        print(f"Local offer ready ms: {offer_ready_ms:.1f}")
        print(f"WHIP answer latency ms: {answer_ms:.1f}")
        print(f"ICE gathering state: {peer_connection.iceGatheringState}")
        print(f"ICE connection state: {peer_connection.iceConnectionState}")
        if connected_ms is not None:
            print(f"ICE connected latency ms: {connected_ms:.1f}")
        print(f"Synthetic frames attempted: {track.sequence}")
        return 0
    finally:
        await peer_connection.close()


def run_static_check() -> int:
    print("WebRTC WHIP publish smoke check passed")
    print(f"Default WHIP URL: {DEFAULT_WHIP_URL}")
    print(f"Default ICE server URL: {DEFAULT_ICE_SERVER_URL}")
    print("Live mode publishes a synthetic yuv420p video track and records WHIP/ICE timing")
    return 0


def parse_args(argv: Sequence[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Publish synthetic WebRTC video through WHIP.")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--check", action="store_true")
    mode.add_argument("--run", action="store_true")
    parser.add_argument("--whip-url", default=DEFAULT_WHIP_URL)
    parser.add_argument("--ice-server-url", default=DEFAULT_ICE_SERVER_URL)
    parser.add_argument("--ice-username", default=None)
    parser.add_argument("--ice-credential", default=None)
    parser.add_argument("--publish-seconds", type=float, default=20)
    parser.add_argument("--timeout-seconds", type=float, default=15)
    parser.add_argument("--width", type=int, default=640)
    parser.add_argument("--height", type=int, default=360)
    parser.add_argument("--fps", type=int, default=15)
    parser.add_argument("--insecure", action="store_true")
    parser.add_argument("--require-connected", action="store_true")
    args = parser.parse_args(argv)
    if not args.check and not args.run:
        args.check = True
    return args


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(sys.argv[1:] if argv is None else argv)
    try:
        if args.check:
            return run_static_check()
        return asyncio.run(run_publish_smoke(args))
    except Exception as error:
        print(f"WebRTC WHIP publish smoke failed: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
