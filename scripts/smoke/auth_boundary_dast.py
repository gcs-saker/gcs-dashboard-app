#!/usr/bin/env python3
"""Bounded authentication-focused DAST for an approved disposable target."""

from __future__ import annotations

import argparse
import json
import ssl
from dataclasses import dataclass
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin, urlsplit
from urllib.request import Request, urlopen

LOOPBACK_HOSTS = {"127.0.0.1", "localhost", "::1"}


@dataclass(frozen=True)
class Scenario:
    name: str
    method: str
    path: str
    body: bytes | None
    expected: tuple[int, ...]
    headers: dict[str, str]


def scenarios() -> list[Scenario]:
    json_headers = {"Content-Type": "application/json", "Origin": "http://127.0.0.1"}
    return [
        Scenario("admin_unauthenticated", "GET", "/auth-policy/admin/devices", None, (401, 403), {}),
        Scenario(
            "graphql_unauthenticated",
            "POST",
            "/auth-policy/graphql",
            b'{"query":"{ operationalEvents { total } }"}',
            (401, 403),
            json_headers,
        ),
        Scenario(
            "websocket_unauthenticated",
            "GET",
            "/ws/v1/telemetry",
            None,
            (401, 403, 426),
            {"Connection": "Upgrade", "Upgrade": "websocket", "Sec-WebSocket-Version": "13"},
        ),
        Scenario("login_malformed_json", "POST", "/auth-policy/auth/login", b"{", (400,), json_headers),
        Scenario(
            "login_oversized",
            "POST",
            "/auth-policy/auth/login",
            b'{"username":"' + b"A" * 70_000 + b'","password":"x"}',
            (400, 413, 429),
            json_headers,
        ),
        Scenario(
            "admin_path_traversal",
            "GET",
            "/auth-policy/admin/devices/%2e%2e/auth/me",
            None,
            (400, 401, 403, 404),
            {},
        ),
    ]


def validate_target(base_url: str, allow_remote: bool) -> None:
    parsed = urlsplit(base_url)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise ValueError("DAST target must be an HTTP origin")
    if parsed.hostname not in LOOPBACK_HOSTS and not (allow_remote and parsed.scheme == "https"):
        raise ValueError("remote DAST requires explicit approval and HTTPS")
    if parsed.path not in {"", "/"} or parsed.query or parsed.fragment:
        raise ValueError("DAST target must not contain a path, query, or fragment")


def execute(base_url: str, scenario: Scenario) -> dict[str, object]:
    request = Request(
        urljoin(base_url.rstrip("/") + "/", scenario.path.lstrip("/")),
        data=scenario.body,
        headers=scenario.headers,
        method=scenario.method,
    )
    status = 0
    try:
        with urlopen(request, timeout=5, context=ssl.create_default_context()) as response:
            status = response.status
            response.read(4096)
    except HTTPError as error:
        status = error.code
        error.read(4096)
    except URLError as error:
        raise RuntimeError(f"DAST target unavailable: {error.reason}") from error
    return {"name": scenario.name, "status": status, "result": "PASS" if status in scenario.expected else "FAIL"}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--run", action="store_true")
    parser.add_argument("--base-url", default="http://127.0.0.1:8080")
    parser.add_argument("--allow-remote", action="store_true")
    args = parser.parse_args()
    validate_target(args.base_url, args.allow_remote)
    if not args.run:
        contracts = [
            {"name": item.name, "method": item.method, "path": item.path, "expected": item.expected}
            for item in scenarios()
        ]
        print(json.dumps({"schemaVersion": "gcs-saker.auth-dast.v1", "scenarios": contracts}))
        return 0
    results = [execute(args.base_url, item) for item in scenarios()]
    print(json.dumps({"schemaVersion": "gcs-saker.auth-dast.v1", "results": results}, sort_keys=True))
    return 1 if any(result["result"] == "FAIL" for result in results) else 0


if __name__ == "__main__":
    raise SystemExit(main())
