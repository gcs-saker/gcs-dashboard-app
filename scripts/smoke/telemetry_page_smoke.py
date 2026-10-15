#!/usr/bin/env python3
"""Read-only telemetry pagination checks against an isolated localhost smoke stack."""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import cast

CONTRACT = Path(__file__).resolve().parents[2] / "contracts/rest/v1/telemetry-page.contract.json"
MAX_BODY_BYTES = 2 * 1024 * 1024
MAX_PAGES = 32
HTTP_TIMEOUT_SECONDS = 5


class TelemetryPageSmokeError(RuntimeError):
    """A bounded check failed; never attach credentials or response bodies."""


class NoFixtureRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *arguments: object, **keywords: object) -> None:
        # A fixture redirect must not turn this local-only check into an external probe.
        return None


@dataclass(frozen=True)
class SmokeResponse:
    status: int
    payload: object
    no_store: bool


def mapping(value: object) -> dict[str, object]:
    if not isinstance(value, dict) or any(not isinstance(key, str) for key in value):
        raise TelemetryPageSmokeError("response_shape_invalid")
    return cast(dict[str, object], value)


def contract_paths() -> tuple[str, str]:
    contract = mapping(json.loads(CONTRACT.read_text(encoding="utf-8")))
    paths = (contract.get("edgePath"), mapping(contract.get("compatibility")).get("legacyEdgePath"))
    if not all(isinstance(path, str) and path.startswith("/api/telemetry/") for path in paths):
        raise TelemetryPageSmokeError("contract_path_invalid")
    return cast(tuple[str, str], paths)


def validate_local_base(base: str) -> None:
    parsed = urllib.parse.urlsplit(base)
    if parsed.hostname not in {"127.0.0.1", "localhost"} or parsed.scheme not in {"http", "https"}:
        raise TelemetryPageSmokeError("local_fixture_required")
    if parsed.username or parsed.password or parsed.query or parsed.fragment or parsed.path not in {"", "/"}:
        raise TelemetryPageSmokeError("local_fixture_required")


def fetch(url: str, bearer: str | None) -> SmokeResponse:
    headers = {"Authorization": "Bearer " + bearer} if bearer else {}
    request = urllib.request.Request(url, headers=headers)
    try:
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoFixtureRedirect())
        response = opener.open(request, timeout=HTTP_TIMEOUT_SECONDS)
    except urllib.error.HTTPError as error:
        response = error
    with response:
        body = response.read(MAX_BODY_BYTES + 1)
        if len(body) > MAX_BODY_BYTES:
            raise TelemetryPageSmokeError("response_too_large")
        return SmokeResponse(response.status, json.loads(body), response.headers.get("Cache-Control") == "no-store")


def identities(value: object) -> list[str]:
    if not isinstance(value, list) or len(value) > MAX_PAGES:
        raise TelemetryPageSmokeError("fixture_list_invalid")
    result = []
    for item in value:
        uuid = mapping(item).get("uuid")
        if not isinstance(uuid, str) or not uuid or len(uuid) > 128:
            raise TelemetryPageSmokeError("fixture_identity_invalid")
        result.append(uuid)
    return result


def walk_pages(url: str, bearer: str) -> tuple[list[str], str]:
    visited: list[str] = []
    cursor: str | None = None
    first_cursor: str | None = None
    for _ in range(MAX_PAGES):
        query = {"limit": "1"}
        if cursor:
            query["cursor"] = cursor
        response = fetch(url + "?" + urllib.parse.urlencode(query), bearer)
        if response.status != 200 or not response.no_store:
            raise TelemetryPageSmokeError("page_read_failed")
        page = mapping(response.payload)
        if "items" not in page or "nextCursor" not in page:
            raise TelemetryPageSmokeError("page_envelope_invalid")
        page_items = identities(page.get("items"))
        if len(page_items) > 1:
            raise TelemetryPageSmokeError("page_limit_not_respected")
        visited.extend(page_items)
        cursor_value = page.get("nextCursor")
        if cursor_value is None:
            if not first_cursor or len(set(visited)) != len(visited):
                raise TelemetryPageSmokeError("fixture_requires_multiple_unique_pages")
            return visited, first_cursor
        if not isinstance(cursor_value, str) or not cursor_value or len(cursor_value) > 2048:
            raise TelemetryPageSmokeError("cursor_contract_invalid")
        first_cursor = first_cursor or cursor_value
        cursor = cursor_value
    raise TelemetryPageSmokeError("page_walk_limit_exceeded")


def verify_denials(url: str, bearer: str, sibling: str, cursor: str) -> None:
    checks = (
        (url, None, 401),
        (url, cursor, 401),
        (url + "?" + urllib.parse.urlencode({"cursor": cursor}), sibling, 403),
        (url + "?cursor=private-page-query-canary", bearer, 400),
        (url + "?limit=0", bearer, 400),
        (url + "?offset=1", bearer, 400),
    )
    for target, token, expected in checks:
        response = fetch(target, token)
        if response.status != expected or "private-page-query-canary" in json.dumps(response.payload):
            raise TelemetryPageSmokeError("page_denial_contract_failed")


def run_smoke(base: str) -> dict[str, object]:
    validate_local_base(base)
    bearer = os.getenv("GCS_SMOKE_PAGE_TOKEN")
    sibling = os.getenv("GCS_SMOKE_SIBLING_TOKEN")
    if not bearer or not sibling:
        raise TelemetryPageSmokeError("fixture_credentials_required")
    page_path, legacy_path = contract_paths()
    legacy = fetch(base.rstrip("/") + legacy_path + "?limit=32", bearer)
    if legacy.status != 200:
        raise TelemetryPageSmokeError("legacy_read_failed")
    expected = identities(legacy.payload)
    if len(expected) >= MAX_PAGES:
        raise TelemetryPageSmokeError("fixture_has_too_many_identities")
    url = base.rstrip("/") + page_path
    actual, cursor = walk_pages(url, bearer)
    if actual != expected:
        raise TelemetryPageSmokeError("legacy_page_results_changed")
    verify_denials(url, bearer, sibling, cursor)
    return {
        "result": "PASS",
        "identity_count": len(actual),
        "legacy_array_unchanged": True,
        "cross_identity_denied": True,
        "cursor_not_authentication": True,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run", action="store_true")
    parser.add_argument("--base-url", default="http://127.0.0.1:18080")
    args = parser.parse_args()
    try:
        contract_paths()
        print(json.dumps(run_smoke(args.base_url) if args.run else {"result": "NOT_RUN"}, sort_keys=True))
        return 0
    except (TelemetryPageSmokeError, urllib.error.URLError, OSError, ValueError):
        print(json.dumps({"result": "FAIL", "error_code": "telemetry_page_smoke_failed"}))
        return 1


if __name__ == "__main__":
    sys.exit(main())
