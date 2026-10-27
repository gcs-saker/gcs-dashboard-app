#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import math
import re
import subprocess

PROBE_IMAGE = "python:3.12-alpine@sha256:dcc0e21003470826202b4bbb3ac8404eb3076b8a5d22119175f4b69edc55bee4"
FIXTURE_NETWORK = re.compile(r"gcs-net-fixture-[a-z0-9-]{1,48}")
PROBE_SCRIPT = """
import json,socket,time
dns=[]; connect=[]; failures=0
for _ in range(int(__import__('os').environ['SAMPLES'])):
  try:
    started=time.perf_counter_ns(); socket.getaddrinfo(__import__('os').environ['TARGET_HOST'],None); dns.append((time.perf_counter_ns()-started)/1e6)
    started=time.perf_counter_ns(); connection=socket.create_connection((__import__('os').environ['TARGET_HOST'],int(__import__('os').environ['TARGET_PORT'])),1); connection.close(); connect.append((time.perf_counter_ns()-started)/1e6)
  except OSError: failures+=1
print(json.dumps({'dnsMs':dns,'connectMs':connect,'failures':failures}))
"""


def percentile(values: list[float], percent: int) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    index = max(0, math.ceil(len(ordered) * percent / 100) - 1)
    return round(ordered[index], 3)


def validate(target: str, port: int, samples: int, network: str, deployment_target: str) -> None:
    if deployment_target != "local-fixture":
        raise ValueError("network benchmark is restricted to a local fixture")
    if not FIXTURE_NETWORK.fullmatch(network):
        raise ValueError("fixture network name is invalid")
    if not target or len(target) > 253 or not 1 <= port <= 65535 or not 1 <= samples <= 100:
        raise ValueError("benchmark target bounds are invalid")


def command(target: str, port: int, samples: int, network: str) -> list[str]:
    return [
        "docker",
        "run",
        "--rm",
        "--network",
        network,
        "--read-only",
        "--cap-drop",
        "ALL",
        "--security-opt",
        "no-new-privileges",
        "--pids-limit",
        "32",
        "--memory",
        "64m",
        "-e",
        f"TARGET_HOST={target}",
        "-e",
        f"TARGET_PORT={port}",
        "-e",
        f"SAMPLES={samples}",
        PROBE_IMAGE,
        "python",
        "-c",
        PROBE_SCRIPT,
    ]


def summarize(payload: dict[str, object], samples: int) -> dict[str, object]:
    dns = [float(value) for value in payload.get("dnsMs", [])]
    connect = [float(value) for value in payload.get("connectMs", [])]
    return {
        "samples": samples,
        "failures": int(payload.get("failures", samples)),
        "dnsMs": {f"p{p}": percentile(dns, p) for p in (50, 95, 99)},
        "connectMs": {f"p{p}": percentile(connect, p) for p in (50, 95, 99)},
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--target", required=True)
    parser.add_argument("--port", type=int, required=True)
    parser.add_argument("--samples", type=int, default=30)
    parser.add_argument("--network", required=True)
    parser.add_argument("--deployment-target", required=True)
    args = parser.parse_args()
    try:
        validate(args.target, args.port, args.samples, args.network, args.deployment_target)
        completed = subprocess.run(
            command(args.target, args.port, args.samples, args.network),
            check=True,
            capture_output=True,
            text=True,
            timeout=240,
        )
        print(json.dumps(summarize(json.loads(completed.stdout), args.samples), separators=(",", ":")))
        return 0
    except (OSError, ValueError, json.JSONDecodeError, subprocess.SubprocessError) as exc:
        print(json.dumps({"status": "BLOCKED", "errorCode": type(exc).__name__}, separators=(",", ":")))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
