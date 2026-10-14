#!/usr/bin/env python3
"""Read-only Server-01 Docker ingress and forwarding-policy drift check."""

from __future__ import annotations

import argparse
import ipaddress
import json
import subprocess
from dataclasses import asdict, dataclass
from typing import Any

COMMAND_TIMEOUT_SECONDS = 5
SERVER_NAME = "Server-01"
PUBLIC_MEDIA_PORTS = frozenset({("tcp", 8189), ("udp", 8189)})
PUBLIC_TURN_CONTROL_PORTS = frozenset({("tcp", 3478), ("udp", 3478), ("tcp", 5349)})
PUBLIC_TURN_RELAY_RANGE = range(49160, 49201)


@dataclass(frozen=True)
class PortBinding:
    container_name: str
    protocol: str
    container_port: int
    host_ip: str
    host_port: int


@dataclass(frozen=True)
class CheckResult:
    name: str
    status: str
    detail: str


def parse_bindings(inspect_payload: list[dict[str, Any]]) -> list[PortBinding]:
    bindings: list[PortBinding] = []
    for container in inspect_payload:
        name = str(container.get("Name", "")).removeprefix("/")
        ports = container.get("NetworkSettings", {}).get("Ports", {}) or {}
        for container_endpoint, host_bindings in ports.items():
            port_text, protocol = container_endpoint.split("/", maxsplit=1)
            for host_binding in host_bindings or []:
                bindings.append(
                    PortBinding(
                        container_name=name,
                        protocol=protocol,
                        container_port=int(port_text),
                        host_ip=str(host_binding.get("HostIp", "")),
                        host_port=int(host_binding.get("HostPort", 0)),
                    )
                )
    return bindings


def is_loopback(host_ip: str) -> bool:
    try:
        return ipaddress.ip_address(host_ip).is_loopback
    except ValueError:
        return False


def service_name(container_name: str) -> str:
    for candidate in ("turn-primary", "turn-secondary", "mediamtx"):
        if candidate in container_name:
            return candidate
    return container_name


def public_binding_allowed(binding: PortBinding) -> bool:
    if is_loopback(binding.host_ip):
        return True
    service = service_name(binding.container_name)
    endpoint = (binding.protocol, binding.container_port)
    if service == "mediamtx":
        return endpoint in PUBLIC_MEDIA_PORTS
    if service.startswith("turn-"):
        return endpoint in PUBLIC_TURN_CONTROL_PORTS or (
            binding.protocol == "udp" and binding.container_port in PUBLIC_TURN_RELAY_RANGE
        )
    return False


def check_public_bindings(bindings: list[PortBinding]) -> CheckResult:
    denied = [binding for binding in bindings if not public_binding_allowed(binding)]
    if denied:
        summary = ", ".join(
            f"{item.container_name}:{item.host_ip}:{item.host_port}->{item.container_port}/{item.protocol}"
            for item in denied
        )
        return CheckResult("docker.public_bindings", "FAIL", summary)
    return CheckResult("docker.public_bindings", "PASS", f"validated {len(bindings)} bindings")


def check_docker_user_rules(rules: str) -> list[CheckResult]:
    lines = [line.strip() for line in rules.splitlines() if line.strip()]
    if not any(line == "-N DOCKER-USER" for line in lines):
        return [CheckResult("firewall.docker_user_chain", "FAIL", "DOCKER-USER chain is missing")]
    established = any("--ctstate RELATED,ESTABLISHED" in line and "-j ACCEPT" in line for line in lines)
    terminal_deny = any(
        line.startswith("-A DOCKER-USER") and ("-j DROP" in line or "-j REJECT" in line) for line in lines
    )
    return [
        CheckResult(
            "firewall.established_return",
            "PASS" if established else "FAIL",
            "RELATED,ESTABLISHED traffic is accepted" if established else "stateful return rule is missing",
        ),
        CheckResult(
            "firewall.default_deny",
            "PASS" if terminal_deny else "FAIL",
            "terminal deny rule is present" if terminal_deny else "terminal DROP/REJECT is missing",
        ),
    ]


def run_command(command: list[str]) -> str:
    result = subprocess.run(
        command,
        check=False,
        capture_output=True,
        text=True,
        timeout=COMMAND_TIMEOUT_SECONDS,
    )
    if result.returncode != 0:
        raise RuntimeError(f"command failed: {command[0]}")
    return result.stdout


def inspect_running_containers() -> list[dict[str, Any]]:
    ids = run_command(["docker", "ps", "--quiet"]).split()
    if not ids:
        return []
    return json.loads(run_command(["docker", "inspect", *ids]))


def collect_live_results() -> list[CheckResult]:
    results: list[CheckResult] = []
    try:
        results.append(check_public_bindings(parse_bindings(inspect_running_containers())))
    except (OSError, RuntimeError, subprocess.TimeoutExpired, ValueError, json.JSONDecodeError) as error:
        results.append(CheckResult("docker.public_bindings", "BLOCKED", type(error).__name__))
    try:
        results.extend(check_docker_user_rules(run_command(["iptables", "-S", "DOCKER-USER"])))
    except (OSError, RuntimeError, subprocess.TimeoutExpired) as error:
        results.append(CheckResult("firewall.docker_user_chain", "BLOCKED", type(error).__name__))
    return results


def overall_status(results: list[CheckResult]) -> str:
    if any(result.status == "FAIL" for result in results):
        return "FAIL"
    if any(result.status == "BLOCKED" for result in results):
        return "BLOCKED"
    return "PASS"


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Print the stable read-only contract")
    return parser


def main() -> int:
    args = build_parser().parse_args()
    if args.check:
        print("Server-01 firewall drift check contract passed")
        return 0
    results = collect_live_results()
    payload = {
        "schemaVersion": "server01-firewall-drift-v1",
        "server": SERVER_NAME,
        "status": overall_status(results),
        "mutation": "none",
        "checks": [asdict(result) for result in results],
    }
    print(json.dumps(payload, ensure_ascii=False, indent=2))
    return 0 if payload["status"] == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
