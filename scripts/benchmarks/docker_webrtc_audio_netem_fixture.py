#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import subprocess
from dataclasses import asdict, dataclass
from pathlib import Path

from docker_network_fault_fixture import CONDITIONS, Condition, Runner, SubprocessRunner, probe_command
from docker_network_path_benchmark import percentile
from docker_turn_netem_fixture import FIXTURE_PASSWORD, FIXTURE_USER, turn_command, wait_turn
from docker_webrtc_ice_netem_fixture import (
    PROBE_IMAGE,
    cleanup,
    mediamtx_command,
    publisher_command,
    validate,
    wait_publisher,
)

AUDIO_PROBE_SCRIPT = r"""
import os,subprocess
command=['python','/opt/gcs/webrtc_audio_continuity.py','--whep-url','http://mediamtx:8889/fixture/whep','--ice-server-url',os.environ['ICE_SERVER_URL'],'--frames',os.environ['AUDIO_FRAMES'],'--timeout-seconds',os.environ['AUDIO_TIMEOUT']]
if os.environ['RELAY_ONLY']=='1': command += ['--ice-username',os.environ['TURN_USER'],'--ice-credential',os.environ['TURN_PASSWORD'],'--relay-only']
result=subprocess.run(command,capture_output=True,text=True,timeout=float(os.environ['AUDIO_TIMEOUT'])+10)
if result.returncode!=0: raise RuntimeError('audio continuity receiver failed')
print(result.stdout.strip())
"""


@dataclass(frozen=True)
class FixtureRequest:
    project: str
    samples: int
    frames: int = 100
    timeout_seconds: int = 10
    relay_only: bool = False


def receiver_command(network: str, condition: Condition, request: FixtureRequest) -> list[str]:
    command = probe_command(
        network,
        condition,
        1,
        probe_script=AUDIO_PROBE_SCRIPT,
        target_host="turn" if request.relay_only else "mediamtx",
        target_port=3478 if request.relay_only else 8889,
        probe_image=PROBE_IMAGE,
    )
    image_index = command.index(PROBE_IMAGE)
    command[image_index:image_index] = [
        "--env",
        f"ICE_SERVER_URL={'turn:turn:3478' if request.relay_only else 'stun:turn:3478'}",
        "--env",
        f"AUDIO_FRAMES={request.frames}",
        "--env",
        f"AUDIO_TIMEOUT={request.timeout_seconds}",
        "--env",
        f"RELAY_ONLY={int(request.relay_only)}",
        "--env",
        f"TURN_USER={FIXTURE_USER}",
        "--env",
        f"TURN_PASSWORD={FIXTURE_PASSWORD}",
    ]
    return command


def metric_p95(samples: list[dict[str, object]], name: str) -> float | None:
    values = [float(item[name]) for item in samples if item.get(name) is not None]
    return percentile(values, 95)


def summarize(
    samples: list[dict[str, object]], requested: int, expected_frames: int = 100, expected_path: str = "direct"
) -> dict[str, object]:
    complete = [item for item in samples if int(item.get("frames", 0)) == expected_frames]
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
        f"{expected_path}Paths": sum(item.get("path") == expected_path for item in complete),
    }


def run_fixture(root: Path, request: FixtureRequest, runner: Runner) -> dict[str, object]:
    validate_request(request)
    network = f"{request.project}-net"
    mediamtx = f"{request.project}-mediamtx"
    publisher = f"{request.project}-publisher"
    turn = f"{request.project}-turn"
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
            for _ in range(request.samples):
                try:
                    command = receiver_command(network, condition, request)
                    observations.append(json.loads(runner.run(command, timeout=request.timeout_seconds + 30)))
                except (json.JSONDecodeError, subprocess.SubprocessError):
                    observations.append({})
            expected_path = "relay" if request.relay_only else "direct"
            metrics = summarize(observations, request.samples, request.frames, expected_path)
            results.append({"condition": asdict(condition), "metrics": metrics})
    finally:
        cleanup(runner, [publisher, mediamtx, turn], network)
    schema = (
        "gcs-saker.webrtc-audio-relay-netem-fixture.v1"
        if request.relay_only
        else "gcs-saker.webrtc-audio-netem-fixture.v1"
    )
    return {"schemaVersion": schema, "project": request.project, "results": results}


def execute(root: Path, project: str, samples: int, runner: Runner) -> dict[str, object]:
    return run_fixture(root, FixtureRequest(project, samples), runner)


def validate_request(request: FixtureRequest) -> None:
    if not 2 <= request.frames <= 3000:
        raise ValueError("audio frame count must be between 2 and 3000")
    if not 1 <= request.timeout_seconds <= 120:
        raise ValueError("audio timeout must be between 1 and 120 seconds")
    if request.timeout_seconds < request.frames / 50 + 5:
        raise ValueError("audio timeout is too short for the requested frames")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--project", required=True)
    parser.add_argument("--deployment-target", required=True)
    parser.add_argument("--samples", type=int, default=2)
    parser.add_argument("--frames", type=int, default=100)
    parser.add_argument("--timeout-seconds", type=int, default=10)
    parser.add_argument("--relay-only", action="store_true")
    args = parser.parse_args()
    try:
        validate(args.project, args.deployment_target, args.samples)
        request = FixtureRequest(args.project, args.samples, args.frames, args.timeout_seconds, args.relay_only)
        root = Path(__file__).resolve().parents[2]
        print(json.dumps(run_fixture(root, request, SubprocessRunner()), separators=(",", ":")))
        return 0
    except (OSError, RuntimeError, ValueError, json.JSONDecodeError, subprocess.SubprocessError) as exc:
        print(json.dumps({"status": "BLOCKED", "errorCode": type(exc).__name__}, separators=(",", ":")))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
