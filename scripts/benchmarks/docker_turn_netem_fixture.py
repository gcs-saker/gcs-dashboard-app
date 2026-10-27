#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import subprocess
import time
from dataclasses import asdict
from pathlib import Path

from docker_network_fault_fixture import (
    CONDITIONS,
    Condition,
    Runner,
    SubprocessRunner,
    build_command,
    cleanup,
    probe_command,
    validate,
)
from docker_network_path_benchmark import percentile

COTURN_IMAGE = "coturn/coturn@sha256:aa68aab64a3b929d57fc2924c98ea447bf996cf8dade2508e7b71eaf23f1f14e"
FIXTURE_USER = "gcs-fixture"
FIXTURE_PASSWORD = "fixture-password-not-for-production"
FIXTURE_REALM = "fixture.invalid"
TURN_SCRIPT = r"""
import importlib.util,json,os,sys,time
spec=importlib.util.spec_from_file_location('turn_relay_smoke','/opt/gcs/turn_relay_smoke.py')
module=importlib.util.module_from_spec(spec); sys.modules[spec.name]=module; spec.loader.exec_module(module)
target=module.TurnTarget(os.environ['TARGET_HOST'],int(os.environ['TARGET_PORT']),'udp')
latencies=[]; failures=0
for _ in range(int(os.environ['SAMPLES'])):
  try:
    started=time.perf_counter_ns(); module.run_turn_allocate(target,os.environ['TURN_USER'],os.environ['TURN_PASSWORD'],2)
    latencies.append((time.perf_counter_ns()-started)/1e6)
  except Exception: failures+=1
print(json.dumps({'turnAllocationMs':latencies,'failures':failures}))
"""


def turn_command(network: str, name: str) -> list[str]:
    return [
        "docker",
        "run",
        "--detach",
        "--name",
        name,
        "--network",
        network,
        "--network-alias",
        "turn",
        "--user",
        "65534:65534",
        "--read-only",
        "--cap-drop",
        "ALL",
        "--cap-add",
        "NET_BIND_SERVICE",
        "--security-opt",
        "no-new-privileges",
        "--pids-limit",
        "64",
        "--memory",
        "64m",
        "--tmpfs",
        "/tmp:rw,noexec,nosuid,nodev,size=8m",
        "--tmpfs",
        "/var/tmp:rw,noexec,nosuid,nodev,size=8m",
        "--entrypoint",
        "turnserver",
        COTURN_IMAGE,
        "-n",
        "--log-file=stdout",
        "--fingerprint",
        "--lt-cred-mech",
        f"--realm={FIXTURE_REALM}",
        f"--user={FIXTURE_USER}:{FIXTURE_PASSWORD}",
        "--listening-port=3478",
        "--min-port=49160",
        "--max-port=49600",
        "--no-cli",
        "--no-tls",
        "--no-dtls",
        "--no-multicast-peers",
    ]


def wait_turn(runner: Runner, container: str) -> None:
    command = ["docker", "exec", container, "turnutils_stunclient", "-p", "3478", "-t", "1000", "127.0.0.1"]
    for _ in range(15):
        try:
            runner.run(command, timeout=5)
            return
        except subprocess.SubprocessError:
            time.sleep(0.2)
    raise RuntimeError("fixture TURN server did not become ready")


def turn_probe_command(network: str, condition: Condition, samples: int) -> list[str]:
    command = probe_command(
        network,
        condition,
        samples,
        probe_script=TURN_SCRIPT,
        target_host="turn",
        target_port=3478,
    )
    image_index = command.index("gcs-saker-netem-probe:local")
    command[image_index:image_index] = [
        "--env",
        f"TURN_USER={FIXTURE_USER}",
        "--env",
        f"TURN_PASSWORD={FIXTURE_PASSWORD}",
    ]
    return command


def summarize(payload: dict[str, object], samples: int) -> dict[str, object]:
    raw = payload.get("turnAllocationMs", [])
    if not isinstance(raw, list):
        raise ValueError("TURN latency payload is invalid")
    values = [float(value) for value in raw]
    return {
        "samples": samples,
        "allocated": len(values),
        "failures": int(payload.get("failures", samples)),
        "turnAllocationMs": {f"p{rank}": percentile(values, rank) for rank in (50, 95, 99)},
    }


def execute(root: Path, project: str, samples: int, runner: Runner) -> dict[str, object]:
    network = f"{project}-net"
    turn = f"{project}-turn"
    results = []
    try:
        runner.run(build_command(root), timeout=300)
        runner.run(["docker", "network", "create", "--internal", network])
        runner.run(turn_command(network, turn))
        wait_turn(runner, turn)
        for condition in CONDITIONS:
            output = runner.run(turn_probe_command(network, condition, samples), timeout=240)
            results.append({"condition": asdict(condition), "metrics": summarize(json.loads(output), samples)})
    finally:
        cleanup(runner, network, turn)
    return {"schemaVersion": "gcs-saker.turn-netem-fixture.v1", "project": project, "results": results}


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
    except (OSError, RuntimeError, ValueError, json.JSONDecodeError, subprocess.SubprocessError) as exc:
        print(json.dumps({"status": "BLOCKED", "errorCode": type(exc).__name__}, separators=(",", ":")))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
