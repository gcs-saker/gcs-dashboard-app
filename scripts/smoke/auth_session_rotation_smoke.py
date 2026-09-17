#!/usr/bin/env python3
"""Validate refresh rotation, replay denial, and logout revocation."""

from __future__ import annotations

import argparse
import json
import os
from http.cookiejar import CookieJar, DefaultCookiePolicy
from urllib.error import HTTPError
from urllib.request import HTTPCookieProcessor, Request, build_opener


def request(opener, url: str, origin: str, body: bytes | None = None, cookie: str = "") -> int:
    headers = {"Origin": origin, "X-GCS-CSRF": "same-origin"}
    if body is not None:
        headers["Content-Type"] = "application/json"
    if cookie:
        headers["Cookie"] = cookie
    try:
        with opener.open(Request(url, data=body, headers=headers, method="POST"), timeout=5) as response:
            response.read(4096)
            return response.status
    except HTTPError as error:
        error.read(4096)
        return error.code


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default="http://127.0.0.1:18080/auth-policy/auth")
    args = parser.parse_args()
    username = os.environ.get("AUTH_SMOKE_USERNAME", "")
    password = os.environ.get("AUTH_SMOKE_PASSWORD", "")
    if not username or not password:
        raise SystemExit("AUTH_SMOKE_USERNAME and AUTH_SMOKE_PASSWORD are required")
    origin = args.base_url.split("/auth-policy/", 1)[0]
    jar = CookieJar(policy=DefaultCookiePolicy(secure_protocols=("http", "https", "wss")))
    opener = build_opener(HTTPCookieProcessor(jar))
    login = request(
        opener, f"{args.base_url}/login", origin, json.dumps({"username": username, "password": password}).encode()
    )
    first_cookie = next(iter(jar))
    first = first_cookie.value
    rotate = request(opener, f"{args.base_url}/refresh", origin)
    second = next(cookie.value for cookie in jar)
    replay_opener = build_opener()
    replay = request(replay_opener, f"{args.base_url}/refresh", origin, cookie=f"{first_cookie.name}={first}")
    logout = request(opener, f"{args.base_url}/logout", origin)
    revoked = request(opener, f"{args.base_url}/refresh", origin)
    result = {
        "login": login,
        "rotate": rotate,
        "rotated": first != second,
        "replay": replay,
        "logout": logout,
        "revoked": revoked,
    }
    print(json.dumps(result, sort_keys=True))
    return (
        0
        if result == {"login": 200, "rotate": 200, "rotated": True, "replay": 401, "logout": 204, "revoked": 401}
        else 1
    )


if __name__ == "__main__":
    raise SystemExit(main())
