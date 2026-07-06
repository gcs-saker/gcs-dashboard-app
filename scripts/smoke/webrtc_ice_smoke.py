#!/usr/bin/env python3
"""Smoke-test WebRTC WHEP signaling and ICE candidate exchange."""

from __future__ import annotations

import argparse
import asyncio
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass
import ipaddress
import ssl
import sys
import time
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


DEFAULT_WHEP_URL = "http://127.0.0.1:8889/raw/sample/front/whep"
DEFAULT_STUN_URL = "stun:stun.l.google.com:19302"
REQUIRED_SDP_MARKERS = ("ice-ufrag", "ice-pwd", "fingerprint")
CONNECTED_ICE_STATES = {"connected", "completed"}
FAILED_ICE_STATES = {"failed", "closed", "disconnected"}
DIRECT_ICE_PATH = "direct"
RELAY_ICE_PATH = "relay"
UNKNOWN_ICE_PATH = "unknown"
DIRECT_CANDIDATE_TYPES = {"host", "srflx", "prflx"}


@dataclass(frozen=True)
class CandidateSummary:
    total: int
    host: int
    srflx: int
    relay: int
    private_or_loopback: int
    public_or_dns: int


@dataclass(frozen=True)
class SelectedIcePair:
    local_candidate_type: str
    remote_candidate_type: str
    protocol: str
    rtt_ms: float | None
    path: str
    relay_fallback_reason: str | None


@dataclass(frozen=True)
class IcePathSummary:
    total: int
    direct: int
    relay: int
    unknown: int
    direct_ratio: float
    relay_ratio: float


@dataclass(frozen=True)
class SdpInspection:
    has_ice_ufrag: bool
    has_ice_pwd: bool
    has_fingerprint: bool
    candidate_count: int
    candidates: CandidateSummary
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
    candidates = summarize_candidates(line for line in lines if line.startswith("a=candidate:"))
    return SdpInspection(
        has_ice_ufrag=any(line.startswith("a=ice-ufrag:") for line in lines),
        has_ice_pwd=any(line.startswith("a=ice-pwd:") for line in lines),
        has_fingerprint=any(line.startswith("a=fingerprint:") for line in lines),
        candidate_count=candidates.total,
        candidates=candidates,
        has_video_media=any(line.startswith("m=video ") for line in lines),
        has_audio_media=any(line.startswith("m=audio ") for line in lines),
    )


def summarize_candidates(candidate_lines: Iterable[str]) -> CandidateSummary:
    total = 0
    host_count = 0
    srflx_count = 0
    relay_count = 0
    private_or_loopback_count = 0
    public_or_dns_count = 0

    for line in candidate_lines:
        total += 1
        parts = line.split()
        candidate_type = _candidate_type(parts)
        address = parts[4] if len(parts) > 4 else ""
        if candidate_type == "host":
            host_count += 1
        elif candidate_type == "srflx":
            srflx_count += 1
        elif candidate_type == "relay":
            relay_count += 1

        if _is_private_or_loopback(address):
            private_or_loopback_count += 1
        else:
            public_or_dns_count += 1

    return CandidateSummary(
        total=total,
        host=host_count,
        srflx=srflx_count,
        relay=relay_count,
        private_or_loopback=private_or_loopback_count,
        public_or_dns=public_or_dns_count,
    )


def _candidate_type(parts: Sequence[str]) -> str:
    try:
        return parts[parts.index("typ") + 1]
    except (ValueError, IndexError):
        return "unknown"


def _is_private_or_loopback(address: str) -> bool:
    try:
        parsed = ipaddress.ip_address(address)
    except ValueError:
        return False
    return parsed.is_private or parsed.is_loopback or parsed.is_link_local


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


def classify_ice_path(local_candidate_type: str, remote_candidate_type: str) -> str:
    candidate_types = {local_candidate_type.lower(), remote_candidate_type.lower()}
    if "relay" in candidate_types:
        return RELAY_ICE_PATH
    if candidate_types and candidate_types <= DIRECT_CANDIDATE_TYPES:
        return DIRECT_ICE_PATH
    return UNKNOWN_ICE_PATH


def summarize_ice_paths(selected_pairs: Iterable[SelectedIcePair]) -> IcePathSummary:
    pairs = list(selected_pairs)
    total = len(pairs)
    direct = sum(1 for pair in pairs if pair.path == DIRECT_ICE_PATH)
    relay = sum(1 for pair in pairs if pair.path == RELAY_ICE_PATH)
    unknown = total - direct - relay
    if total == 0:
        return IcePathSummary(total=0, direct=0, relay=0, unknown=0, direct_ratio=0.0, relay_ratio=0.0)
    return IcePathSummary(
        total=total,
        direct=direct,
        relay=relay,
        unknown=unknown,
        direct_ratio=round(direct / total, 4),
        relay_ratio=round(relay / total, 4),
    )


def infer_relay_fallback_reason(
    selected_pair: SelectedIcePair | None,
    local_offer: SdpInspection,
    whep_answer: SdpInspection,
) -> str | None:
    if selected_pair is None:
        return "selected_pair_unavailable"
    if selected_pair.path != RELAY_ICE_PATH:
        return None
    if selected_pair.local_candidate_type == "relay" and selected_pair.remote_candidate_type == "relay":
        return "both_sides_selected_relay_candidate"
    if selected_pair.local_candidate_type == "relay":
        return "local_selected_relay_candidate"
    if selected_pair.remote_candidate_type == "relay":
        return "remote_selected_relay_candidate"
    if local_offer.candidates.srflx == 0 and whep_answer.candidates.srflx == 0:
        return "server_reflexive_candidate_unavailable"
    return "direct_candidate_failed_relay_selected"


async def collect_selected_ice_pair(peer_connection: object) -> SelectedIcePair | None:
    get_stats = getattr(peer_connection, "getStats", None)
    if get_stats is None:
        return None
    stats_report = await get_stats()
    return extract_selected_ice_pair(stats_report)


def extract_selected_ice_pair(stats_report: object) -> SelectedIcePair | None:
    stats = _stats_values(stats_report)
    stats_by_id = {
        str(stat_id): stat
        for stat in stats
        if (stat_id := _stat_value(stat, "id")) is not None
    }

    selected_pair = _selected_pair_from_transport(stats, stats_by_id) or _selected_pair_from_candidates(stats)
    if selected_pair is None:
        return None

    local_candidate = stats_by_id.get(str(_stat_value(selected_pair, "localCandidateId", "local_candidate_id", default="")))
    remote_candidate = stats_by_id.get(str(_stat_value(selected_pair, "remoteCandidateId", "remote_candidate_id", default="")))
    local_type = str(_stat_value(local_candidate, "candidateType", "candidate_type", default="unknown"))
    remote_type = str(_stat_value(remote_candidate, "candidateType", "candidate_type", default="unknown"))
    protocol = str(
        _stat_value(
            selected_pair,
            "protocol",
            default=_stat_value(local_candidate, "protocol", default=_stat_value(remote_candidate, "protocol", default="unknown")),
        )
    )
    rtt_seconds = _stat_value(selected_pair, "currentRoundTripTime", "current_round_trip_time", default=None)
    rtt_ms = round(float(rtt_seconds) * 1000, 3) if rtt_seconds is not None else None
    path = classify_ice_path(local_type, remote_type)
    return SelectedIcePair(
        local_candidate_type=local_type,
        remote_candidate_type=remote_type,
        protocol=protocol,
        rtt_ms=rtt_ms,
        path=path,
        relay_fallback_reason="selected_pair_contains_relay_candidate" if path == RELAY_ICE_PATH else None,
    )


def _stats_values(stats_report: object) -> list[object]:
    if isinstance(stats_report, Mapping):
        return list(stats_report.values())
    values = getattr(stats_report, "values", None)
    if callable(values):
        return list(values())
    if isinstance(stats_report, Iterable):
        return list(stats_report)
    return []


def _selected_pair_from_transport(stats: Sequence[object], stats_by_id: Mapping[str, object]) -> object | None:
    for stat in stats:
        if _stat_value(stat, "type") != "transport":
            continue
        selected_pair_id = _stat_value(stat, "selectedCandidatePairId", "selected_candidate_pair_id")
        if selected_pair_id is not None and str(selected_pair_id) in stats_by_id:
            return stats_by_id[str(selected_pair_id)]
    return None


def _selected_pair_from_candidates(stats: Sequence[object]) -> object | None:
    candidate_pairs = [stat for stat in stats if _stat_value(stat, "type") == "candidate-pair"]
    for stat in candidate_pairs:
        if _stat_value(stat, "selected", default=False) is True:
            return stat
    for stat in candidate_pairs:
        if _stat_value(stat, "nominated", default=False) is True and _stat_value(stat, "state") == "succeeded":
            return stat
    for stat in candidate_pairs:
        if _stat_value(stat, "state") == "succeeded":
            return stat
    return None


def _stat_value(stat: object, *names: str, default: Any = None) -> Any:
    if stat is None:
        return default
    if isinstance(stat, Mapping):
        for name in names:
            if name in stat:
                return stat[name]
        return default
    for name in names:
        if hasattr(stat, name):
            return getattr(stat, name)
    return default


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

    try:
        await asyncio.wait_for(complete.wait(), timeout=timeout_seconds)
    except asyncio.TimeoutError:
        return


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

    try:
        await asyncio.wait_for(connected.wait(), timeout=timeout_seconds)
    except asyncio.TimeoutError as error:
        final_state = str(getattr(peer_connection, "iceConnectionState"))
        raise RuntimeError(
            f"ICE connection did not reach connected/completed within {timeout_seconds}s: state={final_state}"
        ) from error

    if failed_state:
        raise RuntimeError(f"ICE connection failed with state={failed_state[-1]}")

    final_state = str(getattr(peer_connection, "iceConnectionState"))
    if final_state not in CONNECTED_ICE_STATES:
        raise RuntimeError(f"ICE connection did not reach connected/completed: state={final_state}")


async def wait_for_track_frame(track_queue: asyncio.Queue[object], timeout_seconds: float) -> object:
    track = await asyncio.wait_for(track_queue.get(), timeout=timeout_seconds)
    return await asyncio.wait_for(track.recv(), timeout=timeout_seconds)  # type: ignore[attr-defined]


async def run_webrtc_smoke(args: argparse.Namespace) -> int:
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
        ),
    )
    video_tracks: asyncio.Queue[object] = asyncio.Queue()
    audio_tracks: asyncio.Queue[object] = asyncio.Queue()

    @peer_connection.on("track")  # type: ignore[attr-defined]
    def on_track(track: object) -> None:
        if getattr(track, "kind", "") == "video":
            video_tracks.put_nowait(track)
        if getattr(track, "kind", "") == "audio":
            audio_tracks.put_nowait(track)

    try:
        peer_connection.addTransceiver("video", direction="recvonly")
        if args.measure_audio_video_sync:
            peer_connection.addTransceiver("audio", direction="recvonly")

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

        selected_pair = await collect_selected_ice_pair(peer_connection)
        if selected_pair is not None:
            selected_pair = SelectedIcePair(
                local_candidate_type=selected_pair.local_candidate_type,
                remote_candidate_type=selected_pair.remote_candidate_type,
                protocol=selected_pair.protocol,
                rtt_ms=selected_pair.rtt_ms,
                path=selected_pair.path,
                relay_fallback_reason=infer_relay_fallback_reason(selected_pair, local_inspection, answer_inspection),
            )

        frame = None
        first_frame_elapsed_ms = None
        first_audio_frame_elapsed_ms = None
        if args.require_video_frame:
            video_task = asyncio.create_task(wait_for_track_frame(video_tracks, args.timeout_seconds))
            audio_task = (
                asyncio.create_task(wait_for_track_frame(audio_tracks, args.timeout_seconds))
                if args.measure_audio_video_sync
                else None
            )
            frame = await video_task
            first_frame_elapsed_ms = (time.perf_counter() - started) * 1000
            if audio_task is not None:
                await audio_task
                first_audio_frame_elapsed_ms = (time.perf_counter() - started) * 1000

        print("WebRTC ICE smoke run passed")
        print(f"WHEP URL: {args.whep_url}")
        print(f"ICE server URL: {args.ice_server_url}")
        print(f"Local offer candidates: {local_inspection.candidate_count}")
        print_candidate_summary("Local offer", local_inspection.candidates)
        print(f"WHEP answer candidates: {answer_inspection.candidate_count}")
        print_candidate_summary("WHEP answer", answer_inspection.candidates)
        print(f"Local offer ready ms: {offer_ready_elapsed_ms:.1f}")
        print(f"WHEP answer latency ms: {answer_elapsed_ms:.1f}")
        print(f"ICE gathering state: {peer_connection.iceGatheringState}")
        print(f"ICE connection state: {peer_connection.iceConnectionState}")
        print_selected_ice_pair(selected_pair)
        if frame is not None and first_frame_elapsed_ms is not None:
            print(f"First video frame latency ms: {first_frame_elapsed_ms:.1f}")
            print(f"First video frame size: {frame.width}x{frame.height}")  # type: ignore[attr-defined]
        if first_frame_elapsed_ms is not None and first_audio_frame_elapsed_ms is not None:
            sync_offset_ms = abs(first_audio_frame_elapsed_ms - first_frame_elapsed_ms)
            print(f"First audio frame latency ms: {first_audio_frame_elapsed_ms:.1f}")
            print(f"Audio/video sync offset ms: {sync_offset_ms:.1f}")
        return 0
    finally:
        await peer_connection.close()


def print_candidate_summary(label: str, summary: CandidateSummary) -> None:
    print(
        f"{label} candidate summary: "
        f"host={summary.host}, srflx={summary.srflx}, relay={summary.relay}, "
        f"private_or_loopback={summary.private_or_loopback}, public_or_dns={summary.public_or_dns}"
    )


def print_selected_ice_pair(selected_pair: SelectedIcePair | None) -> None:
    if selected_pair is None:
        print("Selected ICE pair: unavailable")
        print("ICE path: unknown")
        print("Relay fallback reason: selected_pair_unavailable")
        return
    rtt_ms = "unknown" if selected_pair.rtt_ms is None else f"{selected_pair.rtt_ms:.1f}"
    print(
        "Selected ICE pair: "
        f"local={selected_pair.local_candidate_type}, "
        f"remote={selected_pair.remote_candidate_type}, "
        f"protocol={selected_pair.protocol}, "
        f"rtt_ms={rtt_ms}"
    )
    print(f"ICE path: {selected_pair.path}")
    print(f"Relay fallback reason: {selected_pair.relay_fallback_reason or 'none'}")


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
            "m=audio 9 UDP/TLS/RTP/SAVPF 111",
            "a=candidate:1 1 udp 2130706431 127.0.0.1 8189 typ host",
        ]
    )
    inspection = require_webrtc_sdp(sample_sdp, "sample")
    if not inspection.has_video_media:
        raise RuntimeError("sample SDP should include a video media section")
    if not inspection.has_audio_media:
        raise RuntimeError("sample SDP should include an audio media section")
    sample_pair = SelectedIcePair(
        local_candidate_type="srflx",
        remote_candidate_type="host",
        protocol="udp",
        rtt_ms=12.5,
        path=classify_ice_path("srflx", "host"),
        relay_fallback_reason=None,
    )
    path_summary = summarize_ice_paths(
        [
            sample_pair,
            SelectedIcePair(
                local_candidate_type="relay",
                remote_candidate_type="host",
                protocol="udp",
                rtt_ms=31.0,
                path=classify_ice_path("relay", "host"),
                relay_fallback_reason="local_selected_relay_candidate",
            ),
        ]
    )

    print("WebRTC ICE smoke check passed")
    print(f"Required SDP markers: {', '.join(REQUIRED_SDP_MARKERS)}, candidate")
    print_candidate_summary("Sample", inspection.candidates)
    print_selected_ice_pair(sample_pair)
    print(
        "ICE path summary contract: "
        f"total={path_summary.total}, direct={path_summary.direct}, relay={path_summary.relay}, "
        f"direct_ratio={path_summary.direct_ratio:.4f}, relay_ratio={path_summary.relay_ratio:.4f}"
    )
    print("Audio/video sync contract: Audio/video sync offset ms")
    print(f"Default WHEP URL: {DEFAULT_WHEP_URL}")
    print(f"Default ICE server URL: {DEFAULT_STUN_URL}")
    return 0


def parse_args(argv: Sequence[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Validate WHEP offer/answer SDP and optional ICE connected state.",
    )
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--check", action="store_true", help="Run static SDP/parser contract checks.")
    mode.add_argument("--run", action="store_true", help="Run a live WHEP/ICE smoke test with aiortc.")
    parser.add_argument("--whep-url", default=DEFAULT_WHEP_URL)
    parser.add_argument("--stun-url", default=None, help="Deprecated alias for --ice-server-url.")
    parser.add_argument("--ice-server-url", default=None)
    parser.add_argument("--ice-username", default=None)
    parser.add_argument("--ice-credential", default=None)
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
    parser.add_argument(
        "--measure-audio-video-sync",
        action="store_true",
        help="When video is required, also receive first audio frame and print audio/video sync offset.",
    )
    args = parser.parse_args(argv)
    args.ice_server_url = args.ice_server_url or args.stun_url or DEFAULT_STUN_URL
    if args.measure_audio_video_sync:
        args.require_connected = True
        args.require_video_frame = True
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
