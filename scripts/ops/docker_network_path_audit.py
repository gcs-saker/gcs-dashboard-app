#!/usr/bin/env python3
from __future__ import annotations

import argparse
import ipaddress
import json
import re
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

SCHEMA_VERSION = "gcs-saker.network-path-policy.v1"


class NetworkAuditError(RuntimeError):
    pass


@dataclass(frozen=True)
class Check:
    name: str
    status: str
    detail: str


def load_json(path: Path) -> dict[str, Any]:
    document = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(document, dict):
        raise NetworkAuditError("JSON document must be an object")
    return document


def load_policy(path: Path) -> dict[str, Any]:
    policy = load_json(path)
    if policy.get("schemaVersion") != SCHEMA_VERSION:
        raise NetworkAuditError("network policy schema is invalid")
    return policy


def network_names(service: dict[str, Any]) -> set[str]:
    networks = service.get("networks", {})
    if isinstance(networks, list):
        return {str(name) for name in networks}
    if isinstance(networks, dict):
        return {str(name) for name in networks}
    raise NetworkAuditError("service networks are invalid")


def check_memberships(compose: dict[str, Any], policy: dict[str, Any]) -> Check:
    services = compose.get("services", {})
    failures = []
    for name, expected in policy["memberships"].items():
        actual = network_names(services.get(name, {}))
        if actual != set(expected):
            failures.append(name)
    detail = "exact membership matrix" if not failures else f"mismatched services: {','.join(sorted(failures))}"
    return Check("network.memberships", "PASS" if not failures else "FAIL", detail)


def check_internal_networks(compose: dict[str, Any], policy: dict[str, Any]) -> Check:
    networks = compose.get("networks", {})
    failures = [name for name in policy["internalNetworks"] if networks.get(name, {}).get("internal") is not True]
    detail = "private bridges are internal" if not failures else f"non-internal networks: {','.join(sorted(failures))}"
    return Check("network.internal_bridges", "PASS" if not failures else "FAIL", detail)


def check_denied_peers(compose: dict[str, Any], policy: dict[str, Any]) -> Check:
    services = compose.get("services", {})
    reachable = []
    for source, target in policy["deniedPeerPairs"]:
        if network_names(services.get(source, {})) & network_names(services.get(target, {})):
            reachable.append(f"{source}->{target}")
    detail = "denied peers share no network" if not reachable else f"reachable denied peers: {','.join(reachable)}"
    return Check("network.denied_peers", "PASS" if not reachable else "FAIL", detail)


def published_bindings(service: dict[str, Any]) -> list[tuple[int | None, str]]:
    bindings = []
    for port in service.get("ports", []) or []:
        if isinstance(port, dict) and isinstance(port.get("target"), int):
            bindings.append((port["target"], str(port.get("host_ip", "0.0.0.0"))))
        elif isinstance(port, str):
            host_match = re.match(r"^\$\{[^}]+:-([^}]+)\}", port)
            target_match = re.search(r":(\d+)(?:/(?:tcp|udp))?$", port)
            host = host_match.group(1) if host_match else port.split(":", maxsplit=1)[0]
            target = int(target_match.group(1)) if target_match else None
            bindings.append((target, host))
    return bindings


def is_loopback(host: str) -> bool:
    try:
        return ipaddress.ip_address(host).is_loopback
    except ValueError:
        return False


def check_published_ports(compose: dict[str, Any], policy: dict[str, Any]) -> Check:
    allowed = set(policy["publicPortServices"])
    forbidden = set(policy["forbiddenPublishedContainerPorts"])
    failures = []
    for name, service in compose.get("services", {}).items():
        public_targets = {target for target, host in published_bindings(service) if not is_loopback(host)}
        if (public_targets and name not in allowed) or (public_targets & forbidden):
            failures.append(name)
    detail = (
        "published ports follow ingress policy"
        if not failures
        else f"forbidden publications: {','.join(sorted(failures))}"
    )
    return Check("network.published_ports", "PASS" if not failures else "FAIL", detail)


def audit(compose: dict[str, Any], policy: dict[str, Any]) -> list[Check]:
    if not isinstance(compose.get("services"), dict) or not isinstance(compose.get("networks"), dict):
        raise NetworkAuditError("rendered Compose document is invalid")
    return [
        check_memberships(compose, policy),
        check_internal_networks(compose, policy),
        check_denied_peers(compose, policy),
        check_published_ports(compose, policy),
    ]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--compose-json", type=Path, required=True)
    parser.add_argument("--policy", type=Path, required=True)
    args = parser.parse_args()
    try:
        checks = audit(load_json(args.compose_json), load_policy(args.policy))
        status = "PASS" if all(check.status == "PASS" for check in checks) else "FAIL"
        print(json.dumps({"schemaVersion": SCHEMA_VERSION, "status": status, "checks": [asdict(c) for c in checks]}))
        return 0 if status == "PASS" else 1
    except (OSError, ValueError, json.JSONDecodeError, NetworkAuditError) as exc:
        print(json.dumps({"schemaVersion": SCHEMA_VERSION, "status": "FAIL", "errorCode": type(exc).__name__}))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
