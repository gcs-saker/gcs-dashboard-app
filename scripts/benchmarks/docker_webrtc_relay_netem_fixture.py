#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import subprocess
from dataclasses import asdict
from pathlib import Path

from docker_network_fault_fixture import CONDITIONS, Condition, Runner, SubprocessRunner, probe_command
from docker_turn_netem_fixture import FIXTURE_PASSWORD, FIXTURE_USER, turn_command, wait_turn
from docker_webrtc_ice_netem_fixture import (
    PROBE_IMAGE,
    cleanup,
    mediamtx_command,
    publisher_command,
    summarize,
    validate,
    wait_publisher,
)

RELAY_RECEIVER_SCRIPT = r"""
import json,os,re,subprocess
command=['python','/opt/gcs/webrtc_ice_smoke.py','--run','--whep-url','http://mediamtx:8889/fixture/whep','--ice-server-url','turn:turn:3478','--ice-username',os.environ['TURN_USER'],'--ice-credential',os.environ['TURN_PASSWORD'],'--relay-only','--require-connected','--require-selected-pair','--require-relay-path']
result=subprocess.run(command,capture_output=True,text=True,timeout=25)
if result.returncode!=0: raise RuntimeError('relay receiver failed')
def value(label):
  match=re.search(rf'^{re.escape(label)}: ([0-9.]+)$',result.stdout,re.MULTILINE); return float(match.group(1)) if match else None
path=re.search(r'^ICE path: (\w+)$',result.stdout,re.MULTILINE)
print(json.dumps({'iceConnectedMs':value('Receiver ICE connected latency ms'),'signalingMs':value('WHEP signaling round trip ms'),'path':path.group(1) if path else 'unknown'}))
"""


def receiver_command(network: str, condition: Condition) -> list[str]:
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
        f"TURN_USER={FIXTURE_USER}",
        "--env",
        f"TURN_PASSWORD={FIXTURE_PASSWORD}",
    ]
    return command


def execute(root: Path, project: str, samples: int, runner: Runner) -> dict[str, object]:
    network = f"{project}-net"
    mediamtx = f"{project}-mediamtx"
    publisher = f"{project}-publisher"
    turn = f"{project}-turn"
    results = []
    try:
        runner.run(
            [
                "docker",
                "build",
                "--file",
                str(root / "deploy/network/Dockerfile.webrtc-netem-probe"),
                "--tag",
                PROBE_IMAGE,
                str(root),
            ],
            timeout=600,
        )
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
    return {"schemaVersion": "gcs-saker.webrtc-relay-netem-fixture.v1", "project": project, "results": results}


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
