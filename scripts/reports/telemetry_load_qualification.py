#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

EXPECTED_DEVICES = [10, 50, 100]


def load_report(path: Path) -> dict[str, Any]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if payload.get("schemaVersion") != "gcs-saker.telemetry-load.v1":
        raise ValueError("unsupported telemetry load evidence schema")
    results = payload.get("results")
    if not isinstance(results, list) or [item.get("devices") for item in results] != EXPECTED_DEVICES:
        raise ValueError("telemetry load evidence must contain ordered 10/50/100 device results")
    return payload


def validate_report(payload: dict[str, Any]) -> None:
    thresholds = payload["thresholds"]
    for result in payload["results"]:
        if any(result[field] != 0 for field in ("failed", "backpressure", "lost", "orderErrors")):
            raise ValueError(f"telemetry load integrity failed for {result['devices']} devices")
        if result["p95Millis"] > thresholds["maxP95Millis"]:
            raise ValueError(f"telemetry p95 threshold failed for {result['devices']} devices")
        if result["p99Millis"] > thresholds["maxP99Millis"]:
            raise ValueError(f"telemetry p99 threshold failed for {result['devices']} devices")
        minimum = result["devices"] * 10 * thresholds["minimumThroughputRatio"]
        if result["throughputPerSecond"] < minimum:
            raise ValueError(f"telemetry throughput threshold failed for {result['devices']} devices")


def render_markdown(payload: dict[str, Any]) -> str:
    rows = [
        "| 장비 | 송신/처리 | p50 ms | p95 ms | p99 ms | msg/s | 최대 큐 | 실패/압력/손실/순서오류 |",
        "|---:|---:|---:|---:|---:|---:|---:|---:|",
    ]
    for result in payload["results"]:
        integrity = "/".join(str(result[field]) for field in ("failed", "backpressure", "lost", "orderErrors"))
        rows.append(
            f"| {result['devices']} | {result['sent']}/{result['processed']} | "
            f"{result['p50Millis']:.3f} | {result['p95Millis']:.3f} | {result['p99Millis']:.3f} | "
            f"{result['throughputPerSecond']:.1f} | {result['maxQueueDepth']} | {integrity} |"
        )
    return "\n".join(
        [
            "# Telemetry ingress virtual-load qualification",
            "",
            f"- 생성 시각(UTC): `{payload['generatedAt']}`",
            f"- 소스 리비전: `{payload['sourceRevision']}`",
            f"- 런타임: `{payload['runtime']}` / `{payload['platform']}`",
            f"- 범위: {payload['scope']}",
            "- 판정: **PASS (가상 인프로세스 부하)**",
            "- 실제 장비·브로커·네트워크·gRPC·DB 종단 성능 판정: **NOT_RUN**",
            "",
            *rows,
            "",
            "기준: 실패·backpressure·손실·세션 순서 오류 0건, "
            f"p95 ≤ {payload['thresholds']['maxP95Millis']} ms, "
            f"p99 ≤ {payload['thresholds']['maxP99Millis']} ms.",
            "",
        ]
    )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    payload = load_report(args.input)
    validate_report(payload)
    if args.output is not None:
        args.output.write_text(render_markdown(payload), encoding="utf-8")
    if args.check:
        print(json.dumps({"result": "PASS", "scenarios": EXPECTED_DEVICES}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
