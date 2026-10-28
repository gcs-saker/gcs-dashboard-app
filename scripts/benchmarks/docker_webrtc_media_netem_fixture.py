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

MEDIA_RECEIVER_SCRIPT = r"""
import json,re,subprocess
command=['python','/opt/gcs/webrtc_ice_smoke.py','--run','--whep-url','http://mediamtx:8889/fixture/whep','--ice-server-url','stun:turn:3478','--require-connected','--require-selected-pair','--measure-audio-video-sync','--measure-keyframe-interval','--timeout-seconds','5','--latency-profile','playback']
result=subprocess.run(command,capture_output=True,text=True,timeout=20)
if result.returncode!=0: raise RuntimeError('media receiver failed')
def value(label):
  match=re.search(rf'^{re.escape(label)}: ([0-9.]+)$',result.stdout,re.MULTILINE); return float(match.group(1)) if match else None
path=re.search(r'^ICE path: (\w+)$',result.stdout,re.MULTILINE)
print(json.dumps({'iceConnectedMs':value('Receiver ICE connected latency ms'),'videoFrameMs':value('First video frame latency ms'),'audioFrameMs':value('First audio frame latency ms'),'avSyncMs':value('Audio/video sync offset ms'),'iceToVideoMs':value('ICE-to-first-video-frame ms'),'keyframeIntervalMs':value('Video keyframe interval ms'),'path':path.group(1) if path else 'unknown'}))
"""


def receiver_command(network: str, condition: Condition) -> list[str]:
    return probe_command(
        network,
        condition,
        1,
        probe_script=MEDIA_RECEIVER_SCRIPT,
        target_host="mediamtx",
        target_port=8889,
        probe_image=PROBE_IMAGE,
    )


def metric_percentiles(samples: list[dict[str, object]], name: str) -> dict[str, float | None]:
    values = [float(item[name]) for item in samples if item.get(name) is not None]
    return {f"p{rank}": percentile(values, rank) for rank in (50, 95, 99)}


def summarize(samples: list[dict[str, object]], requested: int) -> dict[str, object]:
    complete = [
        item for item in samples if item.get("videoFrameMs") is not None and item.get("audioFrameMs") is not None
    ]
    paths = {name: sum(item.get("path") == name for item in samples) for name in ("direct", "relay", "unknown")}
    return {
        "samples": requested,
        "decoded": len(complete),
        "failures": requested - len(complete),
        "paths": paths,
        "videoFrameMs": metric_percentiles(complete, "videoFrameMs"),
        "audioFrameMs": metric_percentiles(complete, "audioFrameMs"),
        "avSyncMs": metric_percentiles(complete, "avSyncMs"),
        "iceToVideoMs": metric_percentiles(complete, "iceToVideoMs"),
        "keyframeIntervalMs": metric_percentiles(complete, "keyframeIntervalMs"),
        "keyframesObserved": sum(item.get("keyframeIntervalMs") is not None for item in complete),
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
                    observations.append({"path": "unknown"})
            results.append({"condition": asdict(condition), "metrics": summarize(observations, samples)})
    finally:
        cleanup(runner, [publisher, mediamtx, turn], network)
    return {"schemaVersion": "gcs-saker.webrtc-media-netem-fixture.v1", "project": project, "results": results}


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
