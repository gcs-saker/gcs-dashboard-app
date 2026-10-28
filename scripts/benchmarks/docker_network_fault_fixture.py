#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
import subprocess
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Protocol

from docker_network_path_benchmark import PROBE_IMAGE, PROBE_SCRIPT, summarize

PROJECT_PATTERN = re.compile(r"gcs-net-fixture-[a-z0-9-]{1,40}")
PROBE_TAG = "gcs-saker-netem-probe:local"
TARGET_SCRIPT = """
import socket
server=socket.socket(); server.setsockopt(socket.SOL_SOCKET,socket.SO_REUSEADDR,1); server.bind(('0.0.0.0',18080)); server.listen()
while True:
  connection,_=server.accept(); connection.close()
"""


@dataclass(frozen=True)
class Condition:
    name: str
    delay_ms: int
    jitter_ms: int
    loss_percent: float
    reorder_percent: float


CONDITIONS = (
    Condition("baseline", 0, 0, 0, 0),
    Condition("delay", 50, 10, 0, 0),
    Condition("loss", 10, 2, 1, 0),
    Condition("reorder", 20, 5, 0, 5),
)


class Runner(Protocol):
    def run(self, command: list[str], timeout: int = 60) -> str: ...


class SubprocessRunner:
    def run(self, command: list[str], timeout: int = 60) -> str:
        completed = subprocess.run(command, check=True, capture_output=True, text=True, timeout=timeout)
        return completed.stdout.strip()


def validate(project: str, deployment_target: str, samples: int) -> None:
    if deployment_target != "local-fixture":
        raise ValueError("fault fixture is restricted to local-fixture")
    if not PROJECT_PATTERN.fullmatch(project):
        raise ValueError("fixture project name is invalid")
    if not 1 <= samples <= 100:
        raise ValueError("sample count must be between 1 and 100")


def build_command(root: Path) -> list[str]:
    return [
        "docker",
        "build",
        "--file",
        str(root / "deploy/network/Dockerfile.netem-probe"),
        "--tag",
        PROBE_TAG,
        str(root),
    ]


def target_command(network: str, name: str) -> list[str]:
    return [
        "docker",
        "run",
        "--detach",
        "--name",
        name,
        "--network",
        network,
        "--network-alias",
        "target",
        "--read-only",
        "--cap-drop",
        "ALL",
        "--security-opt",
        "no-new-privileges",
        "--pids-limit",
        "32",
        "--memory",
        "64m",
        PROBE_IMAGE,
        "python",
        "-c",
        TARGET_SCRIPT,
    ]


def probe_command(
    network: str,
    condition: Condition,
    samples: int,
    *,
    probe_script: str = PROBE_SCRIPT,
    target_host: str = "target",
    target_port: int = 18080,
    probe_image: str = PROBE_TAG,
) -> list[str]:
    environment = {
        "TARGET_HOST": target_host,
        "TARGET_PORT": str(target_port),
        "SAMPLES": str(samples),
        "NETEM_DELAY_MS": str(condition.delay_ms),
        "NETEM_JITTER_MS": str(condition.jitter_ms),
        "NETEM_LOSS_PERCENT": str(condition.loss_percent),
        "NETEM_REORDER_PERCENT": str(condition.reorder_percent),
        "PROBE_SCRIPT": probe_script,
    }
    command = [
        "docker",
        "run",
        "--rm",
        "--network",
        network,
        "--user",
        "0:0",
        "--read-only",
        "--cap-drop",
        "ALL",
        "--cap-add",
        "NET_ADMIN",
        "--security-opt",
        "no-new-privileges",
        "--pids-limit",
        "32",
        "--memory",
        "64m",
    ]
    for name, value in environment.items():
        command.extend(("--env", f"{name}={value}"))
    return [*command, probe_image]


def cleanup(runner: Runner, network: str, target: str) -> None:
    for command in (["docker", "rm", "--force", target], ["docker", "network", "rm", network]):
        try:
            runner.run(command, timeout=30)
        except (OSError, subprocess.SubprocessError):
            pass


def execute(root: Path, project: str, samples: int, runner: Runner) -> dict[str, object]:
    network = f"{project}-net"
    target = f"{project}-target"
    results = []
    try:
        runner.run(build_command(root), timeout=300)
        runner.run(["docker", "network", "create", "--internal", network])
        runner.run(target_command(network, target))
        for condition in CONDITIONS:
            payload = json.loads(runner.run(probe_command(network, condition, samples), timeout=240))
            results.append({"condition": asdict(condition), "metrics": summarize(payload, samples)})
    finally:
        cleanup(runner, network, target)
    return {"schemaVersion": "gcs-saker.network-fault-fixture.v1", "project": project, "results": results}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--project", required=True)
    parser.add_argument("--deployment-target", required=True)
    parser.add_argument("--samples", type=int, default=30)
    args = parser.parse_args()
    try:
        validate(args.project, args.deployment_target, args.samples)
        root = Path(__file__).resolve().parents[2]
        print(json.dumps(execute(root, args.project, args.samples, SubprocessRunner()), separators=(",", ":")))
        return 0
    except (OSError, ValueError, json.JSONDecodeError, subprocess.SubprocessError) as exc:
        print(json.dumps({"status": "BLOCKED", "errorCode": type(exc).__name__}, separators=(",", ":")))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
