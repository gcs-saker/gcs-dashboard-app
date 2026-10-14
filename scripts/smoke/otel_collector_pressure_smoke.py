#!/usr/bin/env python3
"""Disposable Docker test of Collector privacy, queue saturation and export failure."""

from __future__ import annotations

import argparse
import json
import secrets
import subprocess
import time
from pathlib import Path
from urllib.error import URLError
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[2]
COLLECTOR_IMAGE = (
    "otel/opentelemetry-collector-contrib@sha256:39923a8e431bd1f57be82411999d389fcfe40857492e4365456d97a4c1f74be6"
)
PROBE_IMAGE = "python@sha256:a6e34c598f2467ed0e9a8d349809fcd8b5c603269512df273a0bb1784edc11b1"
CANARY = "OTEL_PRIVATE_CANARY"
REQUEST_COUNT = 96


def docker(*arguments: str) -> str:
    result = subprocess.run(
        ["docker", *arguments],
        check=False,
        capture_output=True,
        text=True,
        timeout=60,
    )
    if result.returncode:
        raise RuntimeError(f"Collector Docker smoke {arguments[0]} failed")
    return result.stdout + (result.stderr if arguments[0] == "logs" else "")


def private_payload(include_links: bool = False) -> bytes:
    attribute = {"key": "unknown.private.attribute", "value": {"stringValue": CANARY}}
    span = {
        "traceId": "0123456789abcdef0123456789abcdef",
        "spanId": "0123456789abcdef",
        "name": CANARY,
        "startTimeUnixNano": "1000000000",
        "endTimeUnixNano": "1001000000",
        "traceState": f"private={CANARY}",
        "attributes": [attribute, {"key": "url.full", "value": {"stringValue": CANARY}}],
        "status": {"code": 2, "message": CANARY},
        "events": [{"name": CANARY, "timeUnixNano": "1000000001", "attributes": [attribute]}],
        "links": [
            {"traceId": "abcdef0123456789abcdef0123456789", "spanId": "abcdef0123456789", "attributes": [attribute]}
        ],
    }
    if not include_links:
        del span["links"]
    return json.dumps(
        {
            "resourceSpans": [
                {
                    "resource": {
                        "attributes": [
                            attribute,
                            {"key": "service.name", "value": {"stringValue": "gcs-saker-backend"}},
                        ]
                    },
                    "scopeSpans": [
                        {"scope": {"name": CANARY, "version": CANARY, "attributes": [attribute]}, "spans": [span]}
                    ],
                }
            ]
        }
    ).encode()


def http_get(url: str) -> str:
    with urlopen(url, timeout=2) as response:
        return response.read(2_000_000).decode()


def wait_for_collector() -> None:
    for _ in range(30):
        try:
            http_get("http://collector:13133/")
            return
        except (URLError, TimeoutError):
            time.sleep(0.5)
    raise RuntimeError("Collector did not become ready")


def metric_value(metrics: str, name: str) -> float:
    return sum(
        float(line.rsplit(" ", 1)[1])
        for line in metrics.splitlines()
        if line.startswith(name + "{") and 'exporter="otlp/fault"' in line
    )


def verify_pressure_metrics() -> dict[str, float]:
    required = {
        "capacity": "otelcol_exporter_queue_capacity",
        "drop": "otelcol_exporter_enqueue_failed_spans",
        "failure": "otelcol_exporter_send_failed_spans",
    }
    for _ in range(20):
        metrics = http_get("http://collector:8888/metrics")
        measured = {key: metric_value(metrics, name) for key, name in required.items()}
        if all(value > 0 for value in measured.values()):
            if "otelcol_exporter_queue_size" not in metrics:
                raise RuntimeError("Collector queue depth metric is missing")
            return measured
        time.sleep(0.5)
    raise RuntimeError("Collector queue/drop/export failure evidence is incomplete")


def run_probe() -> None:
    wait_for_collector()
    for _ in range(REQUEST_COUNT):
        request = Request(
            "http://collector:4318/v1/traces", data=private_payload(), headers={"Content-Type": "application/json"}
        )
        with urlopen(request, timeout=2) as response:
            response.read(4096)
    linked = Request(
        "http://collector:4318/v1/traces", data=private_payload(True), headers={"Content-Type": "application/json"}
    )
    with urlopen(linked, timeout=2) as response:
        response.read(4096)
    measured = verify_pressure_metrics()
    print(json.dumps({"result": "PASS", "requests": REQUEST_COUNT, "metrics": measured}, sort_keys=True))


def collector_arguments(name: str, network: str) -> list[str]:
    return [
        "run",
        "-d",
        "--name",
        name,
        "--network",
        network,
        "--network-alias",
        "collector",
        "--read-only",
        "--user",
        "10001:10001",
        "--cap-drop=ALL",
        "--security-opt=no-new-privileges",
        "--memory=256m",
        "--cpus=0.5",
        "--pids-limit=128",
        "--mount",
        f"type=bind,source={ROOT / 'deploy/otel'},target=/config,readonly",
        COLLECTOR_IMAGE,
        "--config=/config/collector.gateway.yml",
        "--config=/config/collector.fault-smoke.override.yml",
    ]


def run_smoke() -> None:
    name = "gcs-otel-smoke-" + secrets.token_hex(4)
    network = name + "-net"
    docker("network", "create", "--internal", network)
    try:
        docker(*collector_arguments(name, network))
        report = docker(
            "run",
            "--rm",
            "--network",
            network,
            "--read-only",
            "--cap-drop=ALL",
            "--security-opt=no-new-privileges",
            "--mount",
            f"type=bind,source={ROOT},target=/repo,readonly",
            PROBE_IMAGE,
            "python",
            "/repo/scripts/smoke/otel_collector_pressure_smoke.py",
            "--probe",
        )
        exported = docker("logs", name)
        if CANARY in exported:
            raise RuntimeError("Collector privacy contract failed")
        if "gcs.request" not in exported or "gcs.event" not in exported:
            raise RuntimeError("Detailed sanitized export evidence is missing")
        print(report.strip())
        print("Collector privacy, bounded queue, drop and export failure PASS")
    finally:
        docker("rm", "-f", name)
        docker("network", "rm", network)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--probe", action="store_true", help=argparse.SUPPRESS)
    parser.add_argument("--run", action="store_true")
    args = parser.parse_args()
    try:
        if args.probe:
            run_probe()
        elif args.run:
            run_smoke()
        else:
            parser.error("--run is required")
        return 0
    except RuntimeError as error:
        print(f"Collector pressure/privacy smoke FAIL: {error}")
        return 1
    except (URLError, TimeoutError, subprocess.TimeoutExpired):
        print("Collector pressure/privacy smoke FAIL: dependency timeout or unavailable")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
