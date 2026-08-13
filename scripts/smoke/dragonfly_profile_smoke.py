#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[2]
COMPOSE_FILE = REPO_ROOT / "deploy" / "compose" / "compose.single-node.poc.yml"
DRAGONFLY_OVERRIDE_FILE = (
    REPO_ROOT / "deploy" / "compose" / "compose.dragonfly.override.yml"
)
ENV_FILE = REPO_ROOT / "deploy" / "compose" / ".env.single-node.example"
SCHEMA_VERSION = "dragonfly-profile-smoke-v1"
DEFAULT_PROJECT_PREFIX = "gcs-saker-cache-profile"
CLIENT_IMAGE = "python:3.12-alpine"
DEFAULT_DRAGONFLY_IMAGE = "docker.dragonflydb.io/dragonflydb/dragonfly"


CACHE_CONTRACT_CLIENT = r"""
import json
import os
import socket

HOST = os.environ.get("REDIS_HOST", "redis")
PORT = int(os.environ.get("REDIS_PORT", "6379"))
PASSWORD = os.environ["REDIS_PASSWORD"]
PREFIX = os.environ.get("CACHE_SMOKE_PREFIX", "gcs-saker:smoke:cache-profile:")
TIMEOUT = float(os.environ.get("CACHE_SMOKE_TIMEOUT_SECONDS", "2"))


def encode_command(*parts: str) -> bytes:
    body = [f"*{len(parts)}\r\n"]
    for part in parts:
        encoded = part.encode("utf-8")
        body.append(f"${len(encoded)}\r\n")
        body.append(part)
        body.append("\r\n")
    return "".join(body).encode("utf-8")


def read_line(sock: socket.socket) -> bytes:
    data = bytearray()
    while not data.endswith(b"\r\n"):
        chunk = sock.recv(1)
        if not chunk:
            raise RuntimeError("redis connection closed while reading line")
        data.extend(chunk)
    return bytes(data[:-2])


def read_resp(sock: socket.socket):
    prefix = sock.recv(1)
    if not prefix:
        raise RuntimeError("redis connection closed while reading response")
    line = read_line(sock)
    if prefix == b"+":
        return line.decode("utf-8")
    if prefix == b"-":
        raise RuntimeError(line.decode("utf-8"))
    if prefix == b":":
        return int(line)
    if prefix == b"$":
        size = int(line)
        if size < 0:
            return None
        payload = bytearray()
        while len(payload) < size + 2:
            payload.extend(sock.recv(size + 2 - len(payload)))
        return bytes(payload[:size]).decode("utf-8")
    if prefix == b"*":
        return [read_resp(sock) for _ in range(int(line))]
    raise RuntimeError(f"unsupported RESP prefix {prefix!r}")


class RedisClient:
    def __init__(self) -> None:
        self.sock = socket.create_connection((HOST, PORT), timeout=TIMEOUT)
        self.sock.settimeout(TIMEOUT)
        self.command("AUTH", PASSWORD)

    def close(self) -> None:
        self.sock.close()

    def command(self, *parts: str):
        self.sock.sendall(encode_command(*parts))
        return read_resp(self.sock)


def assert_equal(name: str, actual, expected) -> dict:
    if actual != expected:
        raise AssertionError(f"{name}: expected {expected!r}, got {actual!r}")
    return {"name": name, "passed": True, "actual": actual}


def assert_true(name: str, actual: bool, detail) -> dict:
    if not actual:
        raise AssertionError(f"{name}: {detail!r}")
    return {"name": name, "passed": True, "actual": detail}


def run_contract() -> dict:
    client = RedisClient()
    checks = []
    try:
        checks.append(assert_equal("ping", client.command("PING"), "PONG"))

        principal_key = PREFIX + "auth-policy:access-principal:sha256"
        refresh_key = PREFIX + "auth-policy:refresh-session:sha256"
        ice_key = PREFIX + "media-control:ice-servers"
        stream_key = PREFIX + "media-control:stream-list"
        presence_key = PREFIX + "media-control:stream-presence:raw.mobile.front"

        principal_value = "operator01\tOPERATOR\tco-a"
        checks.append(assert_equal("principal.setex", client.command("SETEX", principal_key, "30", principal_value), "OK"))
        checks.append(assert_equal("principal.get", client.command("GET", principal_key), principal_value))
        checks.append(assert_true("principal.ttl", client.command("TTL", principal_key) > 0, "ttl is positive"))

        refresh_value = "operator01\tOPERATOR\tco-a"
        checks.append(assert_equal("refresh.setex", client.command("SETEX", refresh_key, "30", refresh_value), "OK"))
        checks.append(assert_equal("refresh.getdel.first", client.command("GETDEL", refresh_key), refresh_value))
        checks.append(assert_equal("refresh.getdel.second", client.command("GETDEL", refresh_key), None))

        ice_value = json.dumps(
            [
                {"urls": "stun:stun.l.google.com:19302", "healthy": True},
                {"urls": "turn:turn-primary:3478?transport=udp", "username": "gcs-turn", "credential": "secret", "healthy": True},
            ],
            separators=(",", ":"),
        )
        checks.append(assert_equal("ice.setex", client.command("SETEX", ice_key, "10", ice_value), "OK"))
        ice_cached = json.loads(client.command("GET", ice_key))
        checks.append(assert_true("ice.json", ice_cached[0]["urls"].startswith("stun:"), ice_cached))

        stream_value = json.dumps(
            [
                {"path": "raw/mobile/front", "status": "ready", "source": "mediamtx"},
                {"path": "raw/mobile/rear", "status": "ready", "source": "mediamtx"},
            ],
            separators=(",", ":"),
        )
        checks.append(assert_equal("stream-list.setex", client.command("SETEX", stream_key, "1", stream_value), "OK"))
        stream_cached = json.loads(client.command("GET", stream_key))
        checks.append(assert_true("stream-list.json", stream_cached[0]["path"] == "raw/mobile/front", stream_cached))
        checks.append(assert_equal("stream-presence.setex", client.command("SETEX", presence_key, "6", "ready"), "OK"))
        checks.append(assert_equal("stream-presence.get", client.command("GET", presence_key), "ready"))

        deleted = client.command("DEL", principal_key, refresh_key, ice_key, stream_key, presence_key)
        checks.append(assert_true("cleanup.del", deleted >= 4, deleted))
        return {"passed": True, "checks": checks}
    finally:
        client.close()


print(json.dumps(run_contract(), ensure_ascii=False))
"""


@dataclass(frozen=True)
class DragonflyProfileSmokeConfig:
    compose_file: Path
    override_file: Path
    env_file: Path
    project_prefix: str

    def compose_command(self, profile: str, *, include_override: bool) -> list[str]:
        command = [
            "docker",
            "compose",
            "-p",
            f"{self.project_prefix}-{profile}",
            "--env-file",
            str(self.env_file),
            "-f",
            str(self.compose_file),
        ]
        if include_override:
            command.extend(["-f", str(self.override_file)])
        return command

    def config_command(self, profile: str, *, include_override: bool) -> list[str]:
        return [
            *self.compose_command(profile, include_override=include_override),
            "config",
            "--quiet",
        ]

    def readiness_command(self, profile: str, *, include_override: bool) -> list[str]:
        return [
            *self.compose_command(profile, include_override=include_override),
            "up",
            "-d",
            "redis",
        ]

    def down_command(self, profile: str, *, include_override: bool) -> list[str]:
        return [
            *self.compose_command(profile, include_override=include_override),
            "down",
            "--remove-orphans",
        ]

    def client_command(self, profile: str, password: str) -> list[str]:
        return [
            "docker",
            "run",
            "--rm",
            "--network",
            f"{self.project_prefix}-{profile}_control-net",
            "-e",
            "REDIS_HOST=redis",
            "-e",
            "REDIS_PORT=6379",
            "-e",
            f"REDIS_PASSWORD={password}",
            "-e",
            f"CACHE_SMOKE_PREFIX=gcs-saker:smoke:{profile}:",
            CLIENT_IMAGE,
            "python",
            "-c",
            CACHE_CONTRACT_CLIENT,
        ]


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Validate the DragonFly Redis-compatible cache profile."
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help="Print the stable smoke contract without executing docker.",
    )
    parser.add_argument(
        "--run",
        action="store_true",
        help="Run Redis and DragonFly cache contract smoke with docker.",
    )
    parser.add_argument("--compose-file", type=Path, default=COMPOSE_FILE)
    parser.add_argument("--override-file", type=Path, default=DRAGONFLY_OVERRIDE_FILE)
    parser.add_argument("--env-file", type=Path, default=ENV_FILE)
    parser.add_argument("--project-prefix", default=DEFAULT_PROJECT_PREFIX)
    return parser


def main() -> int:
    args = build_parser().parse_args()
    config = DragonflyProfileSmokeConfig(
        compose_file=args.compose_file,
        override_file=args.override_file,
        env_file=args.env_file,
        project_prefix=args.project_prefix,
    )

    payload = {
        "schemaVersion": SCHEMA_VERSION,
        "status": "profile-runtime-contract",
        "profiles": [
            {
                "name": "redis",
                "composeCommand": config.compose_command(
                    "redis", include_override=False
                ),
                "configCommand": config.config_command("redis", include_override=False),
                "readinessCommand": config.readiness_command(
                    "redis", include_override=False
                ),
                "runtime": "redis:7.4-alpine",
            },
            {
                "name": "dragonfly",
                "composeCommand": config.compose_command(
                    "dragonfly", include_override=True
                ),
                "configCommand": config.config_command(
                    "dragonfly", include_override=True
                ),
                "readinessCommand": config.readiness_command(
                    "dragonfly", include_override=True
                ),
                "runtime": "${DRAGONFLY_IMAGE}",
            },
        ],
        "cacheKeyContracts": [
            "auth-policy principal cache uses SETEX/GET/TTL on hashed access-token keys",
            "auth-policy refresh session uses SETEX/GETDEL and must consume a refresh token once",
            "media-control ICE server list uses SETEX/GET JSON cache with short TTL",
            "media-control stream list and stream presence use SETEX/GET JSON or status values",
        ],
        "redisCommandSubset": [
            "AUTH",
            "PING",
            "SETEX",
            "GET",
            "GETDEL",
            "TTL",
            "DEL",
        ],
        "degradedBehavior": [
            "media-control cache miss or cache error falls back to upstream registry and records degraded cache metrics",
            "auth-policy principal cache is best-effort and token verification can continue without the cache",
            "auth-policy refresh session store is authoritative when enabled, so Redis/DragonFly outage must surface in readiness before refresh reuse protection is weakened",
        ],
        "license": {
            "dragonfly": "BSL 1.1",
            "source": "https://www.dragonflydb.io/docs/about/license",
            "productionUseNote": "Self-hosted production use is allowed by DragonFly FAQ as long as DragonFly is not offered as a managed in-memory data-store service.",
            "faq": "https://www.dragonflydb.io/docs/about/faq",
        },
        "runtimeChecks": [
            "default Redis profile and DragonFly override profile pass the same Redis-compatible command subset",
            "cache contract includes session, refresh, ICE list, stream list, and stream presence paths",
            "profile remains optional until benchmark and operational risk are accepted",
        ],
        "promotionGate": "Promote to active only after Redis and DragonFly runtime smoke results are equivalent.",
    }

    if args.check or not args.run:
        print(json.dumps(payload, ensure_ascii=False))
        return 0

    result = run_profiles(config)
    print(json.dumps(result, ensure_ascii=False))
    return 0 if result["passed"] else 1


def run_profiles(config: DragonflyProfileSmokeConfig) -> dict[str, Any]:
    password = read_env_value(config.env_file, "REDIS_PASSWORD")
    dragonfly_image = read_env_value(
        config.env_file, "DRAGONFLY_IMAGE", default=DEFAULT_DRAGONFLY_IMAGE
    )
    profiles = [
        ("redis", False, "redis:7.4-alpine"),
        ("dragonfly", True, dragonfly_image),
    ]
    results = []
    with FilteredEnvFile(config.env_file) as smoke_env_file:
        smoke_config = DragonflyProfileSmokeConfig(
            compose_file=config.compose_file,
            override_file=config.override_file,
            env_file=smoke_env_file,
            project_prefix=config.project_prefix,
        )
        try:
            for name, include_override, image in profiles:
                results.append(
                    run_profile(
                        smoke_config,
                        name,
                        include_override=include_override,
                        image=image,
                        password=password,
                    )
                )
            equivalent = all(
                profile["passed"] for profile in results
            ) and equivalent_check_names(results)
            return {
                "schemaVersion": SCHEMA_VERSION,
                "status": "runtime-validated" if equivalent else "failed",
                "passed": equivalent,
                "profiles": results,
                "equivalentCommandSubset": equivalent,
                "promotionGate": "Keep Redis as default until benchmark and operational risk review approve DragonFly promotion.",
            }
        finally:
            for name, include_override, image in profiles:
                subprocess.run(
                    smoke_config.down_command(name, include_override=include_override),
                    check=False,
                    capture_output=True,
                    text=True,
                    cwd=REPO_ROOT,
                    env=compose_environment(image, f"{config.project_prefix}-{name}"),
                )


def run_profile(
    config: DragonflyProfileSmokeConfig,
    profile: str,
    *,
    include_override: bool,
    image: str,
    password: str,
) -> dict[str, Any]:
    commands = [
        ("config", config.config_command(profile, include_override=include_override)),
        ("up", config.readiness_command(profile, include_override=include_override)),
    ]
    for step, command in commands:
        completed = subprocess.run(
            command,
            check=False,
            capture_output=True,
            text=True,
            cwd=REPO_ROOT,
            env=compose_environment(image, f"{config.project_prefix}-{profile}"),
        )
        if completed.returncode != 0:
            return {
                "name": profile,
                "runtime": image,
                "passed": False,
                "failedStep": step,
                "reason": completed.stderr.strip() or completed.stdout.strip(),
            }

    client = subprocess.run(
        config.client_command(profile, password),
        check=False,
        capture_output=True,
        text=True,
        cwd=REPO_ROOT,
    )
    if client.returncode != 0:
        return {
            "name": profile,
            "runtime": image,
            "passed": False,
            "failedStep": "cache-contract",
            "reason": client.stderr.strip() or client.stdout.strip(),
        }
    contract = json.loads(client.stdout)
    return {
        "name": profile,
        "runtime": image,
        "passed": contract["passed"],
        "checks": contract["checks"],
    }


def equivalent_check_names(results: list[dict[str, Any]]) -> bool:
    if not results:
        return False
    baseline = [check["name"] for check in results[0].get("checks", [])]
    return all(
        [check["name"] for check in result.get("checks", [])] == baseline
        for result in results
    )


def compose_environment(dragonfly_image: str, project_name: str) -> dict[str, str]:
    env = os.environ.copy()
    env["COMPOSE_PROJECT_NAME"] = project_name
    env.setdefault("DRAGONFLY_IMAGE", dragonfly_image)
    return env


class FilteredEnvFile:
    def __init__(self, source: Path) -> None:
        self.source = source
        self._temporary_path: Path | None = None

    def __enter__(self) -> Path:
        temporary = tempfile.NamedTemporaryFile("w", encoding="utf-8", delete=False)
        for line in self.source.read_text(encoding="utf-8").splitlines():
            if line.strip().startswith("COMPOSE_PROJECT_NAME="):
                continue
            temporary.write(line + "\n")
        temporary.flush()
        temporary.close()
        self._temporary_path = Path(temporary.name)
        return self._temporary_path

    def __exit__(self, *_: object) -> None:
        if self._temporary_path is not None:
            self._temporary_path.unlink(missing_ok=True)


def read_env_value(path: Path, key: str, *, default: str | None = None) -> str:
    for line in path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        name, value = stripped.split("=", 1)
        if name == key:
            return value.strip().strip('"').strip("'")
    if default is not None:
        return default
    raise RuntimeError(f"{key} is missing from {path}")


if __name__ == "__main__":
    raise SystemExit(main())
