#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
import subprocess
import time
from dataclasses import asdict
from pathlib import Path

from docker_network_fault_fixture import CONDITIONS, Condition, Runner, SubprocessRunner, probe_command
from docker_network_path_benchmark import percentile
from docker_turn_netem_fixture import turn_command, wait_turn

MEDIAMTX_IMAGE = "bluenviron/mediamtx:1.15.3@sha256:32ecec42d5c716f0b85809b11b6c32f54126546ba89fc85ac57dbcf74738bb4e"
PROBE_IMAGE = "gcs-saker-webrtc-netem-probe:local"
PROJECT_PATTERN = re.compile(r"gcs-net-fixture-[a-z0-9-]{1,36}")
RECEIVER_SCRIPT = r"""
import json,re,subprocess
result=subprocess.run(['python','/opt/gcs/webrtc_ice_smoke.py','--run','--whep-url','http://mediamtx:8889/fixture/whep','--ice-server-url','stun:turn:3478','--require-connected','--require-selected-pair'],capture_output=True,text=True,timeout=20)
if result.returncode!=0: raise RuntimeError('receiver failed')
def value(label):
  match=re.search(rf'^{re.escape(label)}: ([0-9.]+)$',result.stdout,re.MULTILINE); return float(match.group(1)) if match else None
path=re.search(r'^ICE path: (\w+)$',result.stdout,re.MULTILINE)
print(json.dumps({'iceConnectedMs':value('Receiver ICE connected latency ms'),'signalingMs':value('WHEP signaling round trip ms'),'path':path.group(1) if path else 'unknown'}))
"""


def validate(project: str, deployment_target: str, samples: int) -> None:
    if deployment_target != "local-fixture" or not PROJECT_PATTERN.fullmatch(project):
        raise ValueError("WebRTC fixture target is invalid")
    if not 1 <= samples <= 5:
        raise ValueError("WebRTC sample count must be between 1 and 5")


def build_command(root: Path) -> list[str]:
    return [
        "docker",
        "build",
        "--file",
        str(root / "deploy/network/Dockerfile.webrtc-netem-probe"),
        "--tag",
        PROBE_IMAGE,
        str(root),
    ]


def mediamtx_command(network: str, name: str, config: Path) -> list[str]:
    return [
        "docker",
        "run",
        "--detach",
        "--name",
        name,
        "--network",
        network,
        "--network-alias",
        "mediamtx",
        "--read-only",
        "--cap-drop",
        "ALL",
        "--security-opt",
        "no-new-privileges",
        "--pids-limit",
        "64",
        "--memory",
        "128m",
        "--volume",
        f"{config}:/mediamtx.yml:ro",
        MEDIAMTX_IMAGE,
        "/mediamtx.yml",
    ]


def publisher_command(network: str, name: str) -> list[str]:
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
        "/opt/gcs/webrtc_whip_publish_smoke.py",
        "--run",
        "--whip-url",
        "http://mediamtx:8889/fixture/whip",
        "--ice-server-url",
        "stun:turn:3478",
        "--publish-seconds",
        "120",
        "--require-connected",
        "--require-selected-pair",
    ]


def receiver_command(network: str, condition: Condition) -> list[str]:
    return probe_command(
        network,
        condition,
        1,
        probe_script=RECEIVER_SCRIPT,
        target_host="mediamtx",
        target_port=8889,
        probe_image=PROBE_IMAGE,
    )


def wait_publisher(runner: Runner, publisher: str) -> None:
    for _ in range(30):
        if "WHIP publisher connected" in runner.run(["docker", "logs", publisher], timeout=5):
            return
        time.sleep(0.2)
    raise RuntimeError("fixture WHIP publisher did not connect")


def summarize(samples: list[dict[str, object]], requested: int) -> dict[str, object]:
    connected = [float(item["iceConnectedMs"]) for item in samples if item.get("iceConnectedMs") is not None]
    signaling = [float(item["signalingMs"]) for item in samples if item.get("signalingMs") is not None]
    paths = {name: sum(item.get("path") == name for item in samples) for name in ("direct", "relay", "unknown")}
    return {
        "samples": requested,
        "connected": len(connected),
        "failures": requested - len(connected),
        "paths": paths,
        "iceConnectedMs": {f"p{rank}": percentile(connected, rank) for rank in (50, 95, 99)},
        "signalingMs": {f"p{rank}": percentile(signaling, rank) for rank in (50, 95, 99)},
    }


def cleanup(runner: Runner, containers: list[str], network: str) -> None:
    for container in containers:
        try:
            runner.run(["docker", "rm", "--force", container], timeout=30)
        except (OSError, subprocess.SubprocessError):
            pass
    try:
        runner.run(["docker", "network", "rm", network], timeout=30)
    except (OSError, subprocess.SubprocessError):
        pass


def execute(root: Path, project: str, samples: int, runner: Runner) -> dict[str, object]:
    network = f"{project}-net"
    mediamtx = f"{project}-mediamtx"
    publisher = f"{project}-publisher"
    turn = f"{project}-turn"
    results = []
    try:
        runner.run(build_command(root), timeout=600)
        runner.run(["docker", "network", "create", "--internal", network])
        runner.run(mediamtx_command(network, mediamtx, root / "deploy/network/mediamtx.webrtc-fixture.yml"))
        runner.run(turn_command(network, turn))
        wait_turn(runner, turn)
        runner.run(publisher_command(network, publisher))
        wait_publisher(runner, publisher)
        for condition in CONDITIONS:
            observations = []
            for _ in range(samples):
                try:
                    observations.append(json.loads(runner.run(receiver_command(network, condition), timeout=60)))
                except (json.JSONDecodeError, subprocess.SubprocessError):
                    observations.append({"path": "unknown"})
            results.append({"condition": asdict(condition), "metrics": summarize(observations, samples)})
    finally:
        cleanup(runner, [publisher, mediamtx, turn], network)
    return {"schemaVersion": "gcs-saker.webrtc-ice-netem-fixture.v1", "project": project, "results": results}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--project", required=True)
    parser.add_argument("--deployment-target", required=True)
    parser.add_argument("--samples", type=int, default=3)
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
