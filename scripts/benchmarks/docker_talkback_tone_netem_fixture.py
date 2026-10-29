#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import subprocess
import time
from dataclasses import asdict, dataclass
from pathlib import Path

from docker_network_fault_fixture import CONDITIONS, Condition, Runner, SubprocessRunner, probe_command
from docker_network_path_benchmark import percentile
from docker_turn_netem_fixture import FIXTURE_PASSWORD, FIXTURE_USER, turn_command, wait_turn
from docker_webrtc_ice_netem_fixture import PROBE_IMAGE, cleanup, mediamtx_command, validate

MARKER_LEAD_NS = 3_000_000_000
RECEIVER_SCRIPT = r"""
import os,subprocess
path=os.environ['TALKBACK_PATH']; marker=os.environ['MARKER_EPOCH_NS']
result=subprocess.run(['python','/opt/gcs/webrtc_talkback_tone_receiver.py','--whep-url',f'http://mediamtx:8889/{path}/whep','--ice-server-url','stun:turn:3478','--marker-epoch-ns',marker,'--timeout-seconds','10'],capture_output=True,text=True,timeout=20)
if result.returncode!=0: raise RuntimeError('talkback tone receiver failed')
print(result.stdout.strip())
"""
RELAY_RECEIVER_SCRIPT = r"""
import os,subprocess
path=os.environ['TALKBACK_PATH']; marker=os.environ['MARKER_EPOCH_NS']
command=['python','/opt/gcs/webrtc_talkback_tone_receiver.py','--whep-url',f'http://mediamtx:8889/{path}/whep','--ice-server-url','turn:turn:3478','--ice-username',os.environ['TURN_USER'],'--ice-credential',os.environ['TURN_PASSWORD'],'--marker-epoch-ns',marker,'--timeout-seconds','10','--relay-only']
result=subprocess.run(command,capture_output=True,text=True,timeout=20)
if result.returncode!=0: raise RuntimeError('relay Talkback tone receiver failed')
print(result.stdout.strip())
"""


@dataclass(frozen=True)
class FixtureRequest:
    project: str
    samples: int
    relay_only: bool


@dataclass(frozen=True)
class SampleRequest:
    project: str
    condition: Condition
    sample_index: int
    relay_only: bool


def publisher_command(network: str, name: str, path: str, marker_epoch_ns: int) -> list[str]:
    return [
        "docker",
        "run",
        "--detach",
        "--name",
        name,
        "--network",
        network,
        "--read-only",
        "--cap-drop",
        "ALL",
        "--security-opt",
        "no-new-privileges",
        "--pids-limit",
        "128",
        "--memory",
        "256m",
        "--tmpfs",
        "/tmp:rw,noexec,nosuid,nodev,size=32m",
        "--entrypoint",
        "python",
        PROBE_IMAGE,
        "/opt/gcs/webrtc_talkback_tone_publisher.py",
        "--whip-url",
        f"http://mediamtx:8889/{path}/whip",
        "--ice-server-url",
        "stun:turn:3478",
        "--marker-epoch-ns",
        str(marker_epoch_ns),
        "--publish-seconds",
        "8",
    ]


def receiver_command(network: str, condition: Condition, path: str, marker_epoch_ns: int) -> list[str]:
    command = probe_command(
        network,
        condition,
        1,
        probe_script=RECEIVER_SCRIPT,
        target_host="mediamtx",
        target_port=8889,
        probe_image=PROBE_IMAGE,
    )
    image_index = command.index(PROBE_IMAGE)
    command[image_index:image_index] = [
        "--env",
        f"TALKBACK_PATH={path}",
        "--env",
        f"MARKER_EPOCH_NS={marker_epoch_ns}",
    ]
    return command


def relay_receiver_command(network: str, condition: Condition, path: str, marker_epoch_ns: int) -> list[str]:
    command = probe_command(
        network,
        condition,
        1,
        probe_script=RELAY_RECEIVER_SCRIPT,
        target_host="turn",
        target_port=3478,
        probe_image=PROBE_IMAGE,
    )
    image_index = command.index(PROBE_IMAGE)
    command[image_index:image_index] = [
        "--env",
        f"TALKBACK_PATH={path}",
        "--env",
        f"MARKER_EPOCH_NS={marker_epoch_ns}",
        "--env",
        f"TURN_USER={FIXTURE_USER}",
        "--env",
        f"TURN_PASSWORD={FIXTURE_PASSWORD}",
    ]
    return command


def wait_publisher(runner: Runner, publisher: str) -> None:
    for _ in range(30):
        if "Talkback tone publisher connected" in runner.run(["docker", "logs", publisher], timeout=5):
            return
        time.sleep(0.2)
    raise RuntimeError("fixture Talkback publisher did not connect")


def remove_publisher(runner: Runner, publisher: str) -> None:
    try:
        runner.run(["docker", "rm", "--force", publisher], timeout=30)
    except (OSError, subprocess.SubprocessError):
        pass


def metric_percentiles(samples: list[dict[str, object]], name: str) -> dict[str, float | None]:
    values = [float(item[name]) for item in samples if item.get(name) is not None]
    return {f"p{rank}": percentile(values, rank) for rank in (50, 95, 99)}


def summarize(samples: list[dict[str, object]], requested: int, expected_path: str = "direct") -> dict[str, object]:
    detected = [item for item in samples if item.get("tone_latency_ms") is not None]
    return {
        "samples": requested,
        "detected": len(detected),
        "failures": requested - len(detected),
        "toneLatencyMs": metric_percentiles(detected, "tone_latency_ms"),
        "framesBeforeToneMax": max((int(item["frames_before_tone"]) for item in detected), default=0),
        "arrivalGapMaxP95Ms": metric_percentiles(detected, "arrival_gap_max_ms")["p95"],
        f"{expected_path}Paths": sum(item.get("path") == expected_path for item in detected),
    }


def collect_sample(
    runner: Runner,
    request: SampleRequest,
) -> dict[str, object]:
    network = f"{request.project}-net"
    path = f"talkback/raw/fixture/{request.condition.name}-{request.sample_index}"
    publisher = f"{request.project}-publisher-{request.condition.name}-{request.sample_index}"
    marker_epoch_ns = time.time_ns() + MARKER_LEAD_NS
    try:
        runner.run(publisher_command(network, publisher, path, marker_epoch_ns))
        wait_publisher(runner, publisher)
        receiver = relay_receiver_command if request.relay_only else receiver_command
        output = runner.run(receiver(network, request.condition, path, marker_epoch_ns), timeout=60)
        return json.loads(output)
    except (json.JSONDecodeError, subprocess.SubprocessError):
        return {"path": "unknown"}
    finally:
        remove_publisher(runner, publisher)


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


def run_fixture(root: Path, request: FixtureRequest, runner: Runner) -> dict[str, object]:
    network = f"{request.project}-net"
    mediamtx = f"{request.project}-mediamtx"
    turn = f"{request.project}-turn"
    results = []
    try:
        runner.run(build_probe_command(root), timeout=600)
        runner.run(["docker", "network", "create", "--internal", network])
        runner.run(mediamtx_command(network, mediamtx, root / "deploy/network/mediamtx.webrtc-fixture.yml"))
        runner.run(turn_command(network, turn))
        wait_turn(runner, turn)
        for condition in CONDITIONS:
            observations = [
                collect_sample(runner, SampleRequest(request.project, condition, index, request.relay_only))
                for index in range(request.samples)
            ]
            expected_path = "relay" if request.relay_only else "direct"
            results.append(
                {"condition": asdict(condition), "metrics": summarize(observations, request.samples, expected_path)}
            )
    finally:
        cleanup(runner, [mediamtx, turn], network)
    schema_version = (
        "gcs-saker.talkback-tone-relay-netem-fixture.v1"
        if request.relay_only
        else "gcs-saker.talkback-tone-netem-fixture.v1"
    )
    return {
        "schemaVersion": schema_version,
        "project": request.project,
        "results": results,
    }


def execute(root: Path, project: str, samples: int, runner: Runner) -> dict[str, object]:
    return run_fixture(root, FixtureRequest(project, samples, False), runner)


def execute_relay(root: Path, project: str, samples: int, runner: Runner) -> dict[str, object]:
    return run_fixture(root, FixtureRequest(project, samples, True), runner)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--project", required=True)
    parser.add_argument("--deployment-target", required=True)
    parser.add_argument("--samples", type=int, default=2)
    parser.add_argument("--relay-only", action="store_true")
    args = parser.parse_args()
    try:
        validate(args.project, args.deployment_target, args.samples)
        root = Path(__file__).resolve().parents[2]
        request = FixtureRequest(args.project, args.samples, args.relay_only)
        print(json.dumps(run_fixture(root, request, SubprocessRunner()), separators=(",", ":")))
        return 0
    except (OSError, RuntimeError, ValueError, json.JSONDecodeError, subprocess.SubprocessError) as exc:
        print(json.dumps({"status": "BLOCKED", "errorCode": type(exc).__name__}, separators=(",", ":")))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
