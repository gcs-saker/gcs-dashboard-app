#!/usr/bin/env python3
from __future__ import annotations

import argparse
import http.cookiejar
import json
import os
import ssl
import statistics
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Any

SCHEMA_VERSION = "m7-performance-benchmark-v1"
DEFAULT_STREAM_ID = "raw.sample.front"
REQUIRED_METRICS = (
    "auth_login",
    "auth_refresh",
    "ops_event_metrics",
    "ops_event_graphql_page",
    "stream_list",
    "stream_playback",
    "stream_ice_servers",
    "hls_manifest",
)
MEDIA_SMOKE_METRICS = (
    "whep_answer_latency_ms",
    "first_video_frame_latency_ms",
    "first_audio_frame_latency_ms",
    "audio_video_sync_offset_ms",
    "hls_master_latency_ms",
    "hls_variant_latency_ms",
)
ICE_PATH_METRICS = (
    "selected_local_candidate_type",
    "selected_remote_candidate_type",
    "selected_ice_protocol",
    "ice_rtt_ms",
    "direct_ratio",
    "relay_ratio",
    "relay_fallback_reason",
)
ICE_PROFILE_LABELS = (
    "stun-direct",
    "turn-relay",
)


@dataclass(frozen=True)
class BenchmarkProfile:
    label: str
    edge_base_url: str
    auth_base_path: str
    ops_base_path: str
    graphql_base_path: str
    stream_base_path: str
    username: str
    password: str
    stream_id: str

    @property
    def stream_path(self) -> str:
        return self.stream_id.replace(".", "/")


def percentile(sorted_values: list[float], ratio: float) -> float:
    if not sorted_values:
        raise ValueError("cannot calculate percentile for empty values")
    index = round((len(sorted_values) - 1) * ratio)
    return sorted_values[index]


def summarize_metric(name: str, samples_ms: list[float], errors: int) -> dict[str, Any]:
    if not samples_ms:
        return {
            "name": name,
            "samples": 0,
            "errors": errors,
            "p50_ms": None,
            "p95_ms": None,
            "max_ms": None,
        }
    sorted_samples = sorted(samples_ms)
    return {
        "name": name,
        "samples": len(samples_ms),
        "errors": errors,
        "p50_ms": round(statistics.median(sorted_samples), 3),
        "p95_ms": round(percentile(sorted_samples, 0.95), 3),
        "max_ms": round(max(sorted_samples), 3),
    }


def timed_request(
    opener: urllib.request.OpenerDirector,
    request: urllib.request.Request,
) -> tuple[float, int, bytes]:
    started = time.perf_counter_ns()
    try:
        with opener.open(request, timeout=10) as response:
            body = response.read()
            status = response.status
    except urllib.error.HTTPError as error:
        body = error.read()
        status = error.code
    elapsed_ms = (time.perf_counter_ns() - started) / 1_000_000
    return elapsed_ms, status, body


def json_request(
    opener: urllib.request.OpenerDirector,
    url: str,
    method: str,
    payload: dict[str, Any] | None = None,
    headers: dict[str, str] | None = None,
) -> tuple[float, int, dict[str, Any]]:
    request_headers = {"Accept": "application/json"}
    request_headers.update(headers or {})
    data: bytes | None = None
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        request_headers["Content-Type"] = "application/json"
    elapsed_ms, status, body = timed_request(
        opener,
        urllib.request.Request(url, data=data, headers=request_headers, method=method),
    )
    try:
        parsed = json.loads(body.decode("utf-8")) if body else {}
    except json.JSONDecodeError:
        parsed = {"raw": body.decode("utf-8", errors="replace")}
    return elapsed_ms, status, parsed


def measure_metric(
    name: str,
    iterations: int,
    warmup: int,
    call: Any,
) -> dict[str, Any]:
    samples: list[float] = []
    errors = 0
    for iteration in range(warmup + iterations):
        elapsed_ms, status = call()
        if status >= 400:
            errors += 1
        if iteration >= warmup:
            samples.append(elapsed_ms)
    return summarize_metric(name, samples, errors)


def build_http_opener(
    cookie_jar: http.cookiejar.CookieJar, insecure_tls: bool
) -> urllib.request.OpenerDirector:
    handlers: list[Any] = [urllib.request.HTTPCookieProcessor(cookie_jar)]
    if insecure_tls:
        handlers.append(
            urllib.request.HTTPSHandler(context=ssl._create_unverified_context())
        )
    return urllib.request.build_opener(*handlers)


def measure_profile(
    profile: BenchmarkProfile, iterations: int, warmup: int, insecure_tls: bool
) -> dict[str, Any]:
    cookie_jar = http.cookiejar.CookieJar()
    opener = build_http_opener(cookie_jar, insecure_tls)
    edge_base = profile.edge_base_url.rstrip("/")
    auth_base = f"{edge_base}{profile.auth_base_path.rstrip('/')}"
    ops_base = f"{edge_base}{profile.ops_base_path.rstrip('/')}"
    graphql_base = f"{edge_base}{profile.graphql_base_path.rstrip('/')}"
    stream_base = f"{edge_base}{profile.stream_base_path.rstrip('/')}"
    login_payload = {"username": profile.username, "password": profile.password}
    csrf_headers = {
        "Origin": edge_base,
        "X-GCS-CSRF": "same-origin",
    }

    _elapsed, status, login_body = json_request(
        opener,
        f"{auth_base}/login",
        "POST",
        payload=login_payload,
        headers=csrf_headers,
    )
    if status >= 400:
        raise RuntimeError(f"{profile.label} login failed with {status}: {login_body}")
    access_token = login_body.get("access_token")
    if not isinstance(access_token, str) or not access_token:
        raise RuntimeError(
            f"{profile.label} login response did not include access_token"
        )
    auth_headers = {"Authorization": f"Bearer {access_token}"}

    metrics = [
        measure_metric(
            "auth_login",
            iterations,
            warmup,
            lambda: json_request(
                opener,
                f"{auth_base}/login",
                "POST",
                payload=login_payload,
                headers=csrf_headers,
            )[:2],
        ),
        measure_metric(
            "auth_refresh",
            iterations,
            warmup,
            lambda: json_request(
                opener, f"{auth_base}/refresh", "POST", headers=csrf_headers
            )[:2],
        ),
        measure_metric(
            "ops_event_metrics",
            iterations,
            warmup,
            lambda: json_request(
                opener, f"{ops_base}/events/metrics", "GET", headers=auth_headers
            )[:2],
        ),
        measure_metric(
            "ops_event_graphql_page",
            iterations,
            warmup,
            lambda: json_request(
                opener,
                graphql_base,
                "POST",
                payload={
                    "query": "query { operationalEventPage(limit: 10) { events { id severity latencyMs } nextCursor } }"
                },
                headers=auth_headers,
            )[:2],
        ),
        measure_metric(
            "stream_list",
            iterations,
            warmup,
            lambda: json_request(
                opener, f"{stream_base}/streams", "GET", headers=auth_headers
            )[:2],
        ),
        measure_metric(
            "stream_playback",
            iterations,
            warmup,
            lambda: json_request(
                opener,
                f"{stream_base}/streams/{urllib.parse.quote(profile.stream_id)}/playback",
                "GET",
                headers=auth_headers,
            )[:2],
        ),
        measure_metric(
            "stream_ice_servers",
            iterations,
            warmup,
            lambda: json_request(
                opener,
                f"{stream_base}/streams/ice-servers",
                "GET",
                headers=auth_headers,
            )[:2],
        ),
        measure_metric(
            "hls_manifest",
            iterations,
            warmup,
            lambda: timed_request(
                opener,
                urllib.request.Request(
                    f"{edge_base}/hls/{profile.stream_path}/index.m3u8", method="GET"
                ),
            )[:2],
        ),
    ]
    return {
        "label": profile.label,
        "edgeBaseUrl": edge_base,
        "streamId": profile.stream_id,
        "tlsVerification": "disabled" if insecure_tls else "system-default",
        "metrics": metrics,
    }


def load_profiles(path: Path) -> list[BenchmarkProfile]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    profiles_payload = payload.get("profiles")
    if not isinstance(profiles_payload, list) or not profiles_payload:
        raise ValueError("profile file must include a non-empty profiles array")
    profiles: list[BenchmarkProfile] = []
    for item in profiles_payload:
        password = item.get("password")
        password_env = item.get("passwordEnv")
        if password is None and password_env:
            password = os.environ.get(str(password_env))
        if not password:
            raise ValueError(
                f"profile {item.get('label')} needs password or passwordEnv"
            )
        profiles.append(
            BenchmarkProfile(
                label=str(item["label"]),
                edge_base_url=str(item["edgeBaseUrl"]),
                auth_base_path=str(item.get("authBasePath", "/auth-policy/auth")),
                ops_base_path=str(item.get("opsBasePath", "/auth-policy/ops")),
                graphql_base_path=str(
                    item.get("graphQlBasePath", "/auth-policy/graphql")
                ),
                stream_base_path=str(
                    item.get("streamBasePath", "/media-control/api/v1")
                ),
                username=str(item["username"]),
                password=str(password),
                stream_id=str(item.get("streamId", DEFAULT_STREAM_ID)),
            )
        )
    return profiles


def build_check_report() -> dict[str, Any]:
    return {
        "schemaVersion": SCHEMA_VERSION,
        "requiredMetrics": list(REQUIRED_METRICS),
        "mediaSmokeMetrics": list(MEDIA_SMOKE_METRICS),
        "icePathMetrics": list(ICE_PATH_METRICS),
        "iceProfileLabels": list(ICE_PROFILE_LABELS),
        "profileLabels": ["legacy", "v0.2.0", "m7"],
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Build comparable M7 performance benchmark results."
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help="Validate benchmark schema without live HTTP calls.",
    )
    parser.add_argument(
        "--profile-json", type=Path, help="JSON file containing benchmark profiles."
    )
    parser.add_argument("--iterations", type=int, default=30)
    parser.add_argument("--warmup", type=int, default=5)
    parser.add_argument("--output", type=Path, help="Optional JSON output path.")
    parser.add_argument(
        "--insecure",
        action="store_true",
        help="Disable TLS certificate verification for self-signed staging endpoints.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if args.check:
        print(json.dumps(build_check_report(), ensure_ascii=False, sort_keys=True))
        return 0
    if args.iterations < 1:
        raise SystemExit("--iterations must be >= 1")
    if args.warmup < 0:
        raise SystemExit("--warmup must be >= 0")
    if not args.profile_json:
        raise SystemExit("--profile-json is required unless --check is used")

    profiles = load_profiles(args.profile_json)
    report = {
        "schemaVersion": SCHEMA_VERSION,
        "iterations": args.iterations,
        "warmup": args.warmup,
        "iceProfileLabels": list(ICE_PROFILE_LABELS),
        "tlsVerification": "disabled" if args.insecure else "system-default",
        "profiles": [
            measure_profile(profile, args.iterations, args.warmup, args.insecure)
            for profile in profiles
        ],
    }
    output = json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True)
    if args.output:
        args.output.write_text(output + "\n", encoding="utf-8")
    else:
        print(output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
