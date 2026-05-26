#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import socket
import sys
from pathlib import Path
from urllib.error import URLError
from urllib.request import Request, urlopen

REPO_ROOT = Path(__file__).resolve().parents[1]
HEALTH_DOC = REPO_ROOT / "docs" / "operations" / "GCS-Saker_health_readiness_기준_v0.1.md"
MEDIAMTX_CONFIG = REPO_ROOT / "gcs-dashboard" / "mediamtx.yml"
COMPOSE_FILE = REPO_ROOT / "gcs-dashboard" / "docker-compose.yml"
BACKEND_DOCKERFILE = REPO_ROOT / "backend" / "Dockerfile"


def main() -> int:
    parser = argparse.ArgumentParser(description="Check GCS-Saker health/readiness contracts.")
    parser.add_argument("--check", action="store_true", help="Validate local docs and static contracts.")
    parser.add_argument("--run", action="store_true", help="Probe running backend and MediaMTX endpoints.")
    parser.add_argument("--backend-url", default="http://127.0.0.1:8001")
    parser.add_argument("--mediamtx-host", default="127.0.0.1")
    parser.add_argument("--mediamtx-hls-port", type=int, default=8888)
    parser.add_argument("--mediamtx-webrtc-port", type=int, default=8889)
    parser.add_argument("--playback-url", default="")
    args = parser.parse_args()

    if args.run:
        run_live_probe(args)
    else:
        run_static_check()
    return 0


def run_static_check() -> None:
    doc = HEALTH_DOC.read_text(encoding="utf-8")
    mediamtx_config = MEDIAMTX_CONFIG.read_text(encoding="utf-8")
    compose = COMPOSE_FILE.read_text(encoding="utf-8")
    dockerfile = BACKEND_DOCKERFILE.read_text(encoding="utf-8")

    required_doc_terms = [
        "/healthz",
        "/readyz",
        "/metrics",
        "MediaMTX",
        "Docker",
        "Nginx",
        "민감 정보를 노출하지 않는다",
    ]
    for term in required_doc_terms:
        require(term in doc, f"missing documented term: {term}")

    require("api: false" in mediamtx_config, "MediaMTX API must stay disabled by default")
    require("metrics: false" in mediamtx_config, "MediaMTX metrics must stay disabled by default")
    require("9997" not in compose, "MediaMTX management API port must not be published")
    require("9998" not in compose, "MediaMTX metrics port must not be published")
    require("HEALTHCHECK" in dockerfile and "/healthz" in dockerfile, "backend Dockerfile needs healthz healthcheck")

    print("Health/readiness static check passed")


def run_live_probe(args: argparse.Namespace) -> None:
    health = fetch_json(f"{args.backend_url.rstrip('/')}/healthz")
    ready = fetch_json(f"{args.backend_url.rstrip('/')}/readyz")
    require(health.get("status") == "ok", "backend /healthz is not ok")
    require(ready.get("status") == "ok", "backend /readyz is not ok")

    require_tcp(args.mediamtx_host, args.mediamtx_hls_port, "MediaMTX HLS")
    require_tcp(args.mediamtx_host, args.mediamtx_webrtc_port, "MediaMTX WebRTC/WHEP")

    if args.playback_url:
        with urlopen(Request(args.playback_url, method="GET"), timeout=5) as response:
            require(200 <= response.status < 500, f"playback URL returned {response.status}")

    print("Health/readiness live probe passed")


def fetch_json(url: str) -> dict[str, object]:
    try:
        with urlopen(Request(url, method="GET"), timeout=5) as response:
            body = response.read().decode("utf-8")
            require(response.status == 200, f"{url} returned {response.status}")
            return json.loads(body)
    except (OSError, URLError, json.JSONDecodeError) as exc:
        raise SystemExit(f"Failed to fetch {url}: {exc}") from exc


def require_tcp(host: str, port: int, label: str) -> None:
    try:
        with socket.create_connection((host, port), timeout=5):
            return
    except OSError as exc:
        raise SystemExit(f"{label} port is not reachable: {host}:{port}") from exc


def require(condition: bool, message: str) -> None:
    if not condition:
        raise SystemExit(message)


if __name__ == "__main__":
    sys.exit(main())
