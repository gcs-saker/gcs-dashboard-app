#!/usr/bin/env python3
"""Observe selected aiortc ICE pairs without exposing endpoint addresses."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class IcePairObservation:
    local_candidate_type: str
    remote_candidate_type: str
    protocol: str
    rtt_ms: float | None = None

    @property
    def path(self) -> str:
        candidate_types = {self.local_candidate_type, self.remote_candidate_type}
        if "relay" in candidate_types:
            return "relay"
        if candidate_types <= {"host", "srflx", "prflx"}:
            return "direct"
        return "unknown"


def observe_aiortc_selected_pair(peer_connection: object) -> IcePairObservation | None:
    """Use aiortc's nominated pair when its standard stats omit candidate-pair records."""
    for ice_transport in _ice_transports(peer_connection):
        connection = getattr(ice_transport, "_connection", None)
        nominated = getattr(connection, "_nominated", None)
        if not isinstance(nominated, dict):
            continue
        pair = nominated.get(1) or next(iter(nominated.values()), None)
        if pair is None:
            continue
        local_candidate = getattr(pair, "local_candidate", None)
        remote_candidate = getattr(pair, "remote_candidate", None)
        if local_candidate is None or remote_candidate is None:
            continue
        return IcePairObservation(
            local_candidate_type=str(getattr(local_candidate, "type", "unknown")),
            remote_candidate_type=str(getattr(remote_candidate, "type", "unknown")),
            protocol=str(getattr(local_candidate, "transport", "unknown")).lower(),
        )
    return None


def require_ice_path(observation: IcePairObservation | None, *, relay_required: bool) -> None:
    if observation is None:
        raise RuntimeError("selected ICE pair could not be observed")
    if relay_required and observation.path != "relay":
        raise RuntimeError(f"relay-only validation selected a {observation.path} ICE path")


def relay_only_sdp(sdp: str) -> str:
    lines = sdp.replace("\r\n", "\n").split("\n")
    relay_candidates = [line for line in lines if line.startswith("a=candidate:") and " typ relay " in f" {line} "]
    if not relay_candidates:
        raise RuntimeError("relay-only SDP has no relay candidate")
    filtered = [line for line in lines if not line.startswith("a=candidate:") or line in relay_candidates]
    return "\r\n".join(filtered)


def enforce_aiortc_relay_policy(peer_connection: object) -> None:
    transports = _ice_transports(peer_connection)
    if not transports:
        raise RuntimeError("relay-only policy could not find an ICE transport")
    for ice_transport in transports:
        connection = getattr(ice_transport, "_connection", None)
        if connection is None or not hasattr(connection, "_transport_policy"):
            raise RuntimeError("relay-only policy is unsupported by this aiortc runtime")
        current_policy = connection._transport_policy
        relay_policy = getattr(type(current_policy), "RELAY", None)
        if relay_policy is None:
            raise RuntimeError("relay-only policy enum is unavailable")
        connection._transport_policy = relay_policy
        connection._use_ipv4 = False
        connection._use_ipv6 = False


def print_ice_pair_observation(observation: IcePairObservation | None) -> None:
    if observation is None:
        print("Selected ICE pair: unavailable")
        print("ICE path: unknown")
        return
    rtt_ms = "unknown" if observation.rtt_ms is None else f"{observation.rtt_ms:.1f}"
    print(
        "Selected ICE pair: "
        f"local={observation.local_candidate_type}, remote={observation.remote_candidate_type}, "
        f"protocol={observation.protocol}, rtt_ms={rtt_ms}"
    )
    print(f"ICE path: {observation.path}")


def _ice_transports(peer_connection: object) -> list[object]:
    get_transceivers = getattr(peer_connection, "getTransceivers", None)
    if not callable(get_transceivers):
        return []
    transports: list[object] = []
    seen: set[int] = set()
    for transceiver in get_transceivers():
        for endpoint_name in ("sender", "receiver"):
            endpoint = getattr(transceiver, endpoint_name, None)
            dtls_transport = getattr(endpoint, "transport", None)
            ice_transport = getattr(dtls_transport, "transport", None)
            if ice_transport is not None and id(ice_transport) not in seen:
                seen.add(id(ice_transport))
                transports.append(ice_transport)
    return transports
