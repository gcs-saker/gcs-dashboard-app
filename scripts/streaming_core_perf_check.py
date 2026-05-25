#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import statistics
import sys
import time
from collections.abc import Callable
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[1]
BACKEND_ROOT = REPO_ROOT / "backend"
sys.path.insert(0, str(BACKEND_ROOT))

from fastapi.testclient import TestClient  # noqa: E402

from api.stream import get_v1_streaming_service  # noqa: E402
from main import app  # noqa: E402
from modules.ai_contract import AI_CONTRACT_SCHEMA_VERSION  # noqa: E402
from modules.streaming import PlaybackUrlBuilder, PlaybackUrlBuilderConfig, StreamingService  # noqa: E402


MetricCall = Callable[[TestClient], Any]


AI_REQUEST: dict[str, object] = {
    "schemaVersion": AI_CONTRACT_SCHEMA_VERSION,
    "streamId": "raw.sample.front",
    "frame": {
        "streamId": "raw.sample.front",
        "frameId": "perf-frame-0001",
        "capturedAt": "2026-05-26T00:00:00Z",
        "ptsMs": 0,
    },
    "imageUrl": "https://media.example.test/raw/sample/front/perf-frame-0001.jpg",
}


def build_test_service() -> StreamingService:
    builder = PlaybackUrlBuilder(
        PlaybackUrlBuilderConfig(
            public_webrtc_base_url="http://127.0.0.1:8889",
            public_hls_base_url="http://127.0.0.1:8888",
        )
    )
    return StreamingService(playback_url_builder=builder)


def percentile(sorted_values: list[float], ratio: float) -> float:
    if not sorted_values:
        raise ValueError("cannot calculate percentile for empty values")
    index = round((len(sorted_values) - 1) * ratio)
    return sorted_values[index]


def measure_endpoint(
    client: TestClient,
    name: str,
    call: MetricCall,
    iterations: int,
    warmup: int,
) -> dict[str, object]:
    durations_ms: list[float] = []
    errors = 0

    for iteration in range(warmup + iterations):
        started = time.perf_counter_ns()
        response = call(client)
        elapsed_ms = (time.perf_counter_ns() - started) / 1_000_000

        if response.status_code >= 400:
            errors += 1

        if iteration >= warmup:
            durations_ms.append(elapsed_ms)

    sorted_durations = sorted(durations_ms)
    return {
        "name": name,
        "iterations": iterations,
        "warmup": warmup,
        "errors": errors,
        "p50_ms": round(statistics.median(sorted_durations), 3),
        "p95_ms": round(percentile(sorted_durations, 0.95), 3),
        "max_ms": round(max(sorted_durations), 3),
    }


def run_perf_check(iterations: int, warmup: int) -> dict[str, object]:
    service = build_test_service()
    app.dependency_overrides[get_v1_streaming_service] = lambda: service

    try:
        with TestClient(app) as client:
            results = [
                measure_endpoint(
                    client,
                    "stream_list_api",
                    lambda active_client: active_client.get("/api/v1/streams"),
                    iterations,
                    warmup,
                ),
                measure_endpoint(
                    client,
                    "stream_playback_api",
                    lambda active_client: active_client.get(
                        "/api/v1/streams/raw.sample.front/playback"
                    ),
                    iterations,
                    warmup,
                ),
                measure_endpoint(
                    client,
                    "mock_ai_detection_api",
                    lambda active_client: active_client.post(
                        "/api/v1/ai/mock/detections",
                        json=AI_REQUEST,
                    ),
                    iterations,
                    warmup,
                ),
            ]
    finally:
        app.dependency_overrides.clear()

    return {
        "target": "streaming-core-v0.1.0-local-fastapi-testclient",
        "results": results,
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Measure local Streaming Core API latency with FastAPI TestClient."
    )
    parser.add_argument("--iterations", type=int, default=100)
    parser.add_argument("--warmup", type=int, default=10)
    parser.add_argument("--json", action="store_true", help="Print compact JSON.")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if args.iterations < 1:
        raise SystemExit("--iterations must be >= 1")
    if args.warmup < 0:
        raise SystemExit("--warmup must be >= 0")

    report = run_perf_check(iterations=args.iterations, warmup=args.warmup)
    if args.json:
        print(json.dumps(report, sort_keys=True))
    else:
        print(json.dumps(report, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
