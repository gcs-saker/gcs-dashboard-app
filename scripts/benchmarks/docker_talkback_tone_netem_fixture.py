#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import subprocess
import time
from dataclasses import asdict
from pathlib import Path

from docker_network_fault_fixture import CONDITIONS, Condition, Runner, SubprocessRunner, probe_command
from docker_network_path_benchmark import percentile
from docker_turn_netem_fixture import turn_command, wait_turn
from docker_webrtc_ice_netem_fixture import PROBE_IMAGE, cleanup, mediamtx_command, validate

MARKER_LEAD_NS = 3_000_000_000
RECEIVER_SCRIPT = r"""
import os,subprocess
path=os.environ['TALKBACK_PATH']; marker=os.environ['MARKER_EPOCH_NS']
result=subprocess.run(['python','/opt/gcs/webrtc_talkback_tone_receiver.py','--whep-url',f'http://mediamtx:8889/{path}/whep','--ice-server-url','stun:turn:3478','--marker-epoch-ns',marker,'--timeout-seconds','10'],capture_output=True,text=True,timeout=20)
if result.returncode!=0: raise RuntimeError('talkback tone receiver failed')
print(result.stdout.strip())
"""


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


def summarize(samples: list[dict[str, object]], requested: int) -> dict[str, object]:
    detected = [item for item in samples if item.get("tone_latency_ms") is not None]
    return {
        "samples": requested,
        "detected": len(detected),
        "failures": requested - len(detected),
        "toneLatencyMs": metric_percentiles(detected, "tone_latency_ms"),
        "framesBeforeToneMax": max((int(item["frames_before_tone"]) for item in detected), default=0),
        "arrivalGapMaxP95Ms": metric_percentiles(detected, "arrival_gap_max_ms")["p95"],
        "directPaths": sum(item.get("path") == "direct" for item in detected),
    }


def collect_sample(
    runner: Runner,
    project: str,
    condition: Condition,
    sample_index: int,
) -> dict[str, object]:
    network = f"{project}-net"
    path = f"talkback/raw/fixture/{condition.name}-{sample_index}"
    publisher = f"{project}-publisher-{condition.name}-{sample_index}"
    marker_epoch_ns = time.time_ns() + MARKER_LEAD_NS
    try:
        runner.run(publisher_command(network, publisher, path, marker_epoch_ns))
        wait_publisher(runner, publisher)
        output = runner.run(receiver_command(network, condition, path, marker_epoch_ns), timeout=60)
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


def execute(root: Path, project: str, samples: int, runner: Runner) -> dict[str, object]:
    network = f"{project}-net"
    mediamtx = f"{project}-mediamtx"
    turn = f"{project}-turn"
    results = []
    try:
        runner.run(build_probe_command(root), timeout=600)
        runner.run(["docker", "network", "create", "--internal", network])
        runner.run(mediamtx_command(network, mediamtx, root / "deploy/network/mediamtx.webrtc-fixture.yml"))
        runner.run(turn_command(network, turn))
        wait_turn(runner, turn)
        for condition in CONDITIONS:
            observations = [collect_sample(runner, project, condition, index) for index in range(samples)]
            results.append({"condition": asdict(condition), "metrics": summarize(observations, samples)})
    finally:
        cleanup(runner, [mediamtx, turn], network)
    return {"schemaVersion": "gcs-saker.talkback-tone-netem-fixture.v1", "project": project, "results": results}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--project", required=True)
    parser.add_argument("--deployment-target", required=True)
    parser.add_argument("--samples", type=int, default=2)
    args = parser.parse_args()
    try:
        validate(args.project, args.deployment_target, args.samples)
        root = Path(__file__).resolve().parents[2]
        print(json.dumps(execute(root, args.project, args.samples, SubprocessRunner()), separators=(",", ":")))
        return 0
    except (OSError, RuntimeError, ValueError, json.JSONDecodeError, subprocess.SubprocessError) as exc:
        print(json.dumps({"status": "BLOCKED", "errorCode": type(exc).__name__}, separators=(",", ":")))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
