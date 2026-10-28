#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import subprocess
from dataclasses import asdict
from pathlib import Path

from docker_network_fault_fixture import CONDITIONS, Condition, Runner, SubprocessRunner, probe_command
from docker_network_path_benchmark import percentile
from docker_turn_netem_fixture import turn_command, wait_turn
from docker_webrtc_ice_netem_fixture import (
    PROBE_IMAGE,
    cleanup,
    mediamtx_command,
    publisher_command,
    validate,
    wait_publisher,
)

AUDIO_PROBE_SCRIPT = r"""
import subprocess
result=subprocess.run(['python','/opt/gcs/webrtc_audio_continuity.py','--whep-url','http://mediamtx:8889/fixture/whep','--ice-server-url','stun:turn:3478','--frames','100','--timeout-seconds','10'],capture_output=True,text=True,timeout=20)
if result.returncode!=0: raise RuntimeError('audio continuity receiver failed')
print(result.stdout.strip())
"""


def receiver_command(network: str, condition: Condition) -> list[str]:
    return probe_command(
        network,
        condition,
        1,
        probe_script=AUDIO_PROBE_SCRIPT,
        target_host="mediamtx",
        target_port=8889,
        probe_image=PROBE_IMAGE,
    )


def metric_p95(samples: list[dict[str, object]], name: str) -> float | None:
    values = [float(item[name]) for item in samples if item.get(name) is not None]
    return percentile(values, 95)


def summarize(samples: list[dict[str, object]], requested: int) -> dict[str, object]:
    complete = [item for item in samples if int(item.get("frames", 0)) == 100]
    return {
        "samples": requested,
        "complete": len(complete),
        "failures": requested - len(complete),
        "minimumFrames": min((int(item["frames"]) for item in complete), default=0),
        "totalMissingFrames": sum(int(item.get("missing_frames", 0)) for item in complete),
        "firstAudioP95Ms": metric_p95(complete, "first_audio_ms"),
        "arrivalGapP95Ms": metric_p95(complete, "arrival_gap_p95_ms"),
        "arrivalGapMaxP95Ms": metric_p95(complete, "arrival_gap_max_ms"),
        "mediaGapMaxP95Ms": metric_p95(complete, "media_gap_max_ms"),
        "directPaths": sum(item.get("path") == "direct" for item in complete),
    }


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
                    observations.append({})
            results.append({"condition": asdict(condition), "metrics": summarize(observations, samples)})
    finally:
        cleanup(runner, [publisher, mediamtx, turn], network)
    return {"schemaVersion": "gcs-saker.webrtc-audio-netem-fixture.v1", "project": project, "results": results}


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
