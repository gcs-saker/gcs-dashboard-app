#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
import subprocess
import time
from dataclasses import asdict, dataclass
from pathlib import Path

from docker_network_fault_fixture import CONDITIONS, Condition, Runner, SubprocessRunner
from docker_network_path_benchmark import percentile
from docker_turn_netem_fixture import turn_command, wait_turn
from docker_webrtc_audio_netem_fixture import (
    FixtureRequest,
    receiver_command,
)
from docker_webrtc_audio_netem_fixture import (
    validate_request as validate_audio_request,
)
from docker_webrtc_ice_netem_fixture import (
    PROBE_IMAGE,
    cleanup,
    mediamtx_command,
    publisher_command,
    validate,
    wait_publisher,
)

MEMORY_PATTERN = re.compile(r"^([0-9.]+)([KMGT]?i?B)$")
MEMORY_FACTORS = {
    "B": 1,
    "KB": 1000,
    "KiB": 1024,
    "MB": 1000**2,
    "MiB": 1024**2,
    "GB": 1000**3,
    "GiB": 1024**3,
}


@dataclass(frozen=True)
class ResourceRequest:
    project: str
    frames: int = 1000
    timeout_seconds: int = 30
    stats_samples: int = 8
    stats_interval_seconds: float = 1.0


def memory_bytes(raw_value: str) -> int:
    used = raw_value.split("/", 1)[0].strip()
    match = MEMORY_PATTERN.fullmatch(used)
    if match is None or match.group(2) not in MEMORY_FACTORS:
        raise ValueError("Docker memory usage has an unsupported unit")
    return round(float(match.group(1)) * MEMORY_FACTORS[match.group(2)])


def cpu_percent(raw_value: str) -> float:
    if not raw_value.endswith("%"):
        raise ValueError("Docker CPU percentage is invalid")
    return float(raw_value[:-1])


def parse_stats(raw_output: str) -> list[dict[str, object]]:
    samples = []
    for line in raw_output.splitlines():
        payload = json.loads(line)
        samples.append(
            {
                "name": str(payload["Name"]),
                "cpuPercent": cpu_percent(str(payload["CPUPerc"])),
                "memoryBytes": memory_bytes(str(payload["MemUsage"])),
            }
        )
    return samples


def detached_receiver_command(
    network: str,
    condition: Condition,
    request: ResourceRequest,
    receiver_name: str,
) -> list[str]:
    audio_request = FixtureRequest(request.project, 1, request.frames, request.timeout_seconds, True)
    command = receiver_command(network, condition, audio_request)
    remove_index = command.index("--rm")
    command[remove_index : remove_index + 1] = ["--detach", "--name", receiver_name]
    return command


def stats_command(containers: list[str]) -> list[str]:
    return ["docker", "stats", "--no-stream", "--format", "{{json .}}", *containers]


def collect_stats(runner: Runner, containers: list[str], request: ResourceRequest) -> list[dict[str, object]]:
    observations = []
    for sample_index in range(request.stats_samples):
        observations.extend(parse_stats(runner.run(stats_command(containers), timeout=15)))
        if sample_index + 1 < request.stats_samples:
            time.sleep(request.stats_interval_seconds)
    return observations


def component_name(container: str) -> str:
    if "-receiver-" in container:
        return "receiver"
    return container.rsplit("-", 1)[-1]


def summarize_resources(samples: list[dict[str, object]], containers: list[str]) -> dict[str, object]:
    results = {}
    for container in containers:
        owned = [sample for sample in samples if sample["name"] == container]
        cpu_values = [float(sample["cpuPercent"]) for sample in owned]
        memory_values = [int(sample["memoryBytes"]) for sample in owned]
        results[component_name(container)] = {
            "samples": len(owned),
            "cpuP50Percent": percentile(cpu_values, 50),
            "cpuP95Percent": percentile(cpu_values, 95),
            "cpuMaxPercent": max(cpu_values, default=None),
            "memoryMaxBytes": max(memory_values, default=None),
        }
    return results


def wait_receiver(runner: Runner, receiver: str, timeout_seconds: int) -> dict[str, object]:
    exit_code = runner.run(["docker", "wait", receiver], timeout=timeout_seconds + 15)
    if exit_code.strip() != "0":
        raise RuntimeError("resource fixture receiver failed")
    return json.loads(runner.run(["docker", "logs", receiver], timeout=10))


def remove_receiver(runner: Runner, receiver: str) -> None:
    try:
        runner.run(["docker", "rm", "--force", receiver], timeout=30)
    except (OSError, subprocess.SubprocessError):
        pass


def collect_condition(
    runner: Runner,
    request: ResourceRequest,
    condition: Condition,
    shared_containers: list[str],
) -> dict[str, object]:
    receiver = f"{request.project}-receiver-{condition.name}"
    containers = [*shared_containers, receiver]
    try:
        command = detached_receiver_command(f"{request.project}-net", condition, request, receiver)
        runner.run(command)
        samples = collect_stats(runner, containers, request)
        continuity = wait_receiver(runner, receiver, request.timeout_seconds)
        return {"continuity": continuity, "resources": summarize_resources(samples, containers)}
    finally:
        remove_receiver(runner, receiver)


def validate_request(request: ResourceRequest) -> None:
    audio_request = FixtureRequest(request.project, 1, request.frames, request.timeout_seconds, True)
    validate_audio_request(audio_request)
    if not 1 <= request.stats_samples <= 60:
        raise ValueError("resource sample count must be between 1 and 60")
    if not 0.1 <= request.stats_interval_seconds <= 5:
        raise ValueError("resource sample interval must be between 0.1 and 5 seconds")


def build_probe_command(root: Path) -> list[str]:
    return [
        "docker",
        "build",
        "--file",
        str(root / "deploy/network/Dockerfile.webrtc-netem-probe"),
        "--tag",
        PROBE_IMAGE,
        str(root),
    ]


def execute(root: Path, request: ResourceRequest, runner: Runner) -> dict[str, object]:
    validate_request(request)
    network = f"{request.project}-net"
    mediamtx = f"{request.project}-mediamtx"
    publisher = f"{request.project}-publisher"
    turn = f"{request.project}-turn"
    results = []
    try:
        runner.run(build_probe_command(root), timeout=600)
        runner.run(["docker", "network", "create", "--internal", network])
        runner.run(mediamtx_command(network, mediamtx, root / "deploy/network/mediamtx.webrtc-fixture.yml"))
        runner.run(turn_command(network, turn))
        wait_turn(runner, turn)
        runner.run(publisher_command(network, publisher))
        wait_publisher(runner, publisher)
        for condition in CONDITIONS:
            measurement = collect_condition(runner, request, condition, [mediamtx, turn])
            results.append({"condition": asdict(condition), **measurement})
    finally:
        cleanup(runner, [publisher, mediamtx, turn], network)
    return {
        "schemaVersion": "gcs-saker.webrtc-audio-relay-resource-fixture.v1",
        "project": request.project,
        "results": results,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--project", required=True)
    parser.add_argument("--deployment-target", required=True)
    parser.add_argument("--frames", type=int, default=1000)
    parser.add_argument("--timeout-seconds", type=int, default=30)
    parser.add_argument("--stats-samples", type=int, default=8)
    parser.add_argument("--stats-interval-seconds", type=float, default=1)
    args = parser.parse_args()
    try:
        validate(args.project, args.deployment_target, 1)
        request = ResourceRequest(
            args.project,
            args.frames,
            args.timeout_seconds,
            args.stats_samples,
            args.stats_interval_seconds,
        )
        root = Path(__file__).resolve().parents[2]
        print(json.dumps(execute(root, request, SubprocessRunner()), separators=(",", ":")))
        return 0
    except (OSError, RuntimeError, ValueError, json.JSONDecodeError, subprocess.SubprocessError) as exc:
        print(json.dumps({"status": "BLOCKED", "errorCode": type(exc).__name__}, separators=(",", ":")))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
