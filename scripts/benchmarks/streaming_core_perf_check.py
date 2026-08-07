#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import statistics
import sys
import time
from collections.abc import Callable
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[2]
BACKEND_ROOT = REPO_ROOT / "backend"
sys.path.insert(0, str(BACKEND_ROOT))

from api.auth import get_password_hash  # noqa: E402
from api.stream import get_v1_streaming_service  # noqa: E402
from core.db import Base, get_db  # noqa: E402
from core.security import AuthSettings, create_access_token  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from main import app  # noqa: E402
from modules.ai_contract import AI_CONTRACT_SCHEMA_VERSION  # noqa: E402
from modules.streaming import (  # noqa: E402
    PlaybackUrlBuilder,
    PlaybackUrlBuilderConfig,
    StreamingService,
)
from sql.company_sql import Company  # noqa: E402
from sql.user_sql import User  # noqa: E402
from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.orm import Session, sessionmaker  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

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
    os.environ.setdefault(
        "AUTH_JWT_SECRET",
        "local-perf-check-secret-for-gcs-saker-at-least-32-chars",
    )
    os.environ.setdefault("AUTH_REFRESH_COOKIE_SECURE", "false")
    token = create_access_token(
        "perf-operator",
        "operator",
        settings=AuthSettings.from_env(),
    )
    headers = {"Authorization": f"Bearer {token}"}
    engine = create_engine(
        "sqlite+pysqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    testing_session_local = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)
    seed_db = testing_session_local()
    try:
        seed_benchmark_user(seed_db)
    finally:
        seed_db.close()

    def override_get_db():
        db = testing_session_local()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db

    try:
        with TestClient(app) as client:
            login_payload = {"username": "perf-operator", "password": "perf-password"}
            login_response = client.post("/auth/login", json=login_payload)
            if login_response.status_code != 200:
                raise RuntimeError(
                    f"benchmark login failed with {login_response.status_code}"
                )
            results = [
                measure_endpoint(
                    client,
                    "auth_login_api",
                    lambda active_client: active_client.post(
                        "/auth/login", json=login_payload
                    ),
                    iterations,
                    warmup,
                ),
                measure_endpoint(
                    client,
                    "auth_refresh_api",
                    lambda active_client: active_client.post("/auth/refresh"),
                    iterations,
                    warmup,
                ),
                measure_endpoint(
                    client,
                    "stream_list_api",
                    lambda active_client: active_client.get(
                        "/api/v1/streams", headers=headers
                    ),
                    iterations,
                    warmup,
                ),
                measure_endpoint(
                    client,
                    "stream_ice_servers_api",
                    lambda active_client: active_client.get(
                        "/api/v1/streams/ice-servers", headers=headers
                    ),
                    iterations,
                    warmup,
                ),
                measure_endpoint(
                    client,
                    "stream_playback_api",
                    lambda active_client: active_client.get(
                        "/api/v1/streams/raw.sample.front/playback",
                        headers=headers,
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
                        headers=headers,
                    ),
                    iterations,
                    warmup,
                ),
            ]
    finally:
        app.dependency_overrides.clear()
        Base.metadata.drop_all(bind=engine)
        engine.dispose()

    return {
        "target": "streaming-core-v0.1.0-local-fastapi-testclient",
        "results": results,
    }


def seed_benchmark_user(db: Session) -> None:
    db.add(Company(id=1, companyname="A4AI", invite_code="A4AI01"))
    db.add(
        User(
            username="perf-operator",
            email="perf-operator@example.com",
            password_hash=get_password_hash("perf-password"),
            company_id=1,
            role="operator",
        )
    )
    db.commit()


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
