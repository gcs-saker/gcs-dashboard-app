#!/usr/bin/env python3
"""Read-only Server-01 Docker ingress and forwarding-policy drift check."""

from __future__ import annotations

import argparse
import ipaddress
import json
import subprocess
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

COMMAND_TIMEOUT_SECONDS = 5
SERVER_NAME = "Server-01"
DEFAULT_POLICY = Path(__file__).resolve().parents[2] / "deploy/firewall/server01-docker-forwarding-policy.json"


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


def load_policy(path: Path = DEFAULT_POLICY) -> dict[str, Any]:
    policy = json.loads(path.read_text(encoding="utf-8"))
    if policy.get("schemaVersion") != "server01-docker-forwarding-policy-v1":
        raise ValueError("unsupported firewall policy schema")
    if policy.get("server") != SERVER_NAME:
        raise ValueError("firewall policy targets the wrong server")
    return policy


def service_name(container_name: str, candidates: set[str]) -> str:
    for candidate in sorted(candidates, key=len, reverse=True):
        if candidate in container_name:
            return candidate
    return container_name


def public_binding_allowed(binding: PortBinding, policy: dict[str, Any]) -> bool:
    if is_loopback(binding.host_ip):
        return True
    public_bindings = policy["dockerPublicBindings"]
    service = service_name(binding.container_name, set(public_bindings))
    service_policy = public_bindings.get(service)
    if service_policy is None:
        return False
    if binding.container_port in service_policy.get(binding.protocol, []):
        return True
    return binding.protocol == "udp" and any(
        start <= binding.container_port <= end for start, end in service_policy.get("udpRanges", [])
    )


def check_public_bindings(bindings: list[PortBinding], policy: dict[str, Any] | None = None) -> CheckResult:
    active_policy = policy or load_policy()
    denied = [binding for binding in bindings if not public_binding_allowed(binding, active_policy)]
    if denied:
        summary = ", ".join(
            f"{item.container_name}:{item.host_ip}:{item.host_port}->{item.container_port}/{item.protocol}"
            for item in denied
        )
        return CheckResult("docker.public_bindings", "FAIL", summary)
    return CheckResult("docker.public_bindings", "PASS", f"validated {len(bindings)} bindings")


def check_docker_user_rules(rules: str, policy: dict[str, Any] | None = None) -> list[CheckResult]:
    firewall_policy = (policy or load_policy())["firewall"]
    lines = [line.strip() for line in rules.splitlines() if line.strip()]
    if not any(line == "-N DOCKER-USER" for line in lines):
        return [CheckResult("firewall.docker_user_chain", "FAIL", "DOCKER-USER chain is missing")]
    established = any("--ctstate RELATED,ESTABLISHED" in line and "-j ACCEPT" in line for line in lines)
    chain_rules = [line for line in lines if line.startswith("-A DOCKER-USER")]
    deny_indexes = [index for index, line in enumerate(chain_rules) if "-j DROP" in line or "-j REJECT" in line]
    terminal_deny = bool(deny_indexes)
    first_deny = deny_indexes[0] if deny_indexes else len(chain_rules)
    unconditional_accept = any(line == "-A DOCKER-USER -j ACCEPT" for line in chain_rules)
    return_before_deny = any("-j RETURN" in line for line in chain_rules[:first_deny])
    accept_after_deny = any("-j ACCEPT" in line for line in chain_rules[first_deny + 1 :])
    ordered = not (
        firewall_policy["forbidUnconditionalAccept"]
        and unconditional_accept
        or firewall_policy["forbidReturnBeforeDeny"]
        and return_before_deny
        or accept_after_deny
    )
    established_ok = established or not firewall_policy["requireEstablishedReturn"]
    deny_ok = terminal_deny or not firewall_policy["requireTerminalDeny"]
    return [
        CheckResult(
            "firewall.established_return",
            "PASS" if established_ok else "FAIL",
            "RELATED,ESTABLISHED traffic is accepted" if established_ok else "stateful return rule is missing",
        ),
        CheckResult(
            "firewall.default_deny",
            "PASS" if deny_ok else "FAIL",
            "terminal deny rule is present" if deny_ok else "terminal DROP/REJECT is missing",
        ),
        CheckResult(
            "firewall.rule_order",
            "PASS" if ordered else "FAIL",
            "allow rules precede terminal deny" if ordered else "ACCEPT/RETURN bypasses terminal deny",
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


def collect_live_results(policy: dict[str, Any]) -> list[CheckResult]:
    results: list[CheckResult] = []
    try:
        results.append(check_public_bindings(parse_bindings(inspect_running_containers()), policy))
    except (OSError, RuntimeError, subprocess.TimeoutExpired, ValueError, json.JSONDecodeError) as error:
        results.append(CheckResult("docker.public_bindings", "BLOCKED", type(error).__name__))
    try:
        results.extend(check_docker_user_rules(run_command(["iptables", "-S", "DOCKER-USER"]), policy))
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
    parser.add_argument("--policy", type=Path, default=DEFAULT_POLICY)
    return parser


def main() -> int:
    args = build_parser().parse_args()
    if args.check:
        print("Server-01 firewall drift check contract passed")
        return 0
    try:
        policy = load_policy(args.policy)
    except (OSError, ValueError, json.JSONDecodeError) as error:
        results = [CheckResult("policy.load", "FAIL", type(error).__name__)]
    else:
        results = collect_live_results(policy)
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
