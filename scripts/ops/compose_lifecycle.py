#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import subprocess
import sys
import time
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

START_PHASES = (
    ("postgres-geo", "healthy"),
    ("redis", "healthy"),
    ("mqtt", "healthy"),
    ("auth-policy", "healthy"),
    ("backend", "healthy"),
    ("media-control", "healthy"),
    ("mediamtx", "running"),
    ("turn-primary", "healthy"),
    ("dashboard", "healthy"),
    ("edge", "healthy"),
)
STOP_SERVICES = tuple(service for service, _ in reversed(START_PHASES))
STATEFUL_SERVICES = frozenset({"postgres-geo", "redis", "mqtt"})
COMMAND_TIMEOUT_SECONDS = 60


class LifecycleError(RuntimeError):
    pass


class Runner(Protocol):
    def run(self, command: list[str], timeout: int = COMMAND_TIMEOUT_SECONDS) -> str: ...


class SubprocessRunner:
    def run(self, command: list[str], timeout: int = COMMAND_TIMEOUT_SECONDS) -> str:
        completed = subprocess.run(command, check=True, capture_output=True, text=True, timeout=timeout)
        return completed.stdout.strip()


@dataclass(frozen=True)
class LifecycleConfig:
    compose_file: Path
    env_file: Path
    project_name: str
    deployment_target: str
    wait_seconds: int
    poll_seconds: float

    def validate(self) -> None:
        if self.deployment_target != "server01-production":
            raise LifecycleError("only Server-01 production is managed")
        if self.project_name != "gcs-saker-m2-production":
            raise LifecycleError("invalid production project name")
        for path in (self.compose_file, self.env_file):
            if not path.is_absolute() or not path.is_file():
                raise LifecycleError("Compose and environment files must be existing absolute files")
        if self.wait_seconds < 10 or self.wait_seconds > 600 or not 0.1 <= self.poll_seconds <= 10:
            raise LifecycleError("lifecycle wait bounds are invalid")


class ComposeLifecycle:
    def __init__(self, config: LifecycleConfig, runner: Runner, sleep: Callable[[float], None] = time.sleep) -> None:
        self.config = config
        self.runner = runner
        self.sleep = sleep

    def compose(self, *arguments: str) -> list[str]:
        return [
            "docker",
            "compose",
            "--project-name",
            self.config.project_name,
            "--env-file",
            str(self.config.env_file),
            "-f",
            str(self.config.compose_file),
            *arguments,
        ]

    def check(self) -> None:
        self.config.validate()
        rendered = json.loads(self.runner.run(self.compose("config", "--format", "json")))
        validate_runtime_secrets(rendered)
        validate_internal_pki(rendered)

    def start(self) -> None:
        self.check()
        for service, expected in START_PHASES:
            started = time.monotonic()
            container = self.container_id(service)
            if not container:
                category = "stateful" if service in STATEFUL_SERVICES else "managed"
                raise LifecycleError(f"{category} service is absent: {service}; use approved deployment")
            self.runner.run(self.compose("start", service))
            self.wait(container, expected, service, started)

    def stop(self) -> None:
        self.config.validate()
        for service in STOP_SERVICES:
            if self.container_id(service):
                started = time.monotonic()
                self.runner.run(self.compose("stop", service), timeout=self.config.wait_seconds)
                emit_event("stop", service, "stopped", started)

    def container_id(self, service: str) -> str:
        return self.runner.run(self.compose("ps", "-aq", service))

    def wait(self, container: str, expected: str, service: str, started: float) -> None:
        deadline = time.monotonic() + self.config.wait_seconds
        while time.monotonic() < deadline:
            state = self.runner.run(
                [
                    "docker",
                    "inspect",
                    "--format",
                    "{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}",
                    container,
                ],
            )
            if state == expected:
                emit_event("start", service, expected, started)
                return
            if state in {"unhealthy", "exited", "dead"}:
                raise LifecycleError(f"service readiness failed: {service}={state}")
            self.sleep(self.config.poll_seconds)
        raise LifecycleError(f"service readiness timed out: {service}")


def validate_runtime_secrets(rendered: object) -> None:
    if not isinstance(rendered, dict) or not isinstance(rendered.get("secrets"), dict):
        raise LifecycleError("rendered Compose secrets are unavailable")
    for specification in rendered["secrets"].values():
        if not isinstance(specification, dict):
            raise LifecycleError("rendered Compose secret is invalid")
        path = Path(str(specification.get("file", "")))
        if not path.is_absolute() or not path.is_file() or path.stat().st_size == 0:
            raise LifecycleError("required runtime secret file is unavailable")


def validate_internal_pki(rendered: object) -> None:
    if not isinstance(rendered, dict) or not isinstance(rendered.get("services"), dict):
        raise LifecycleError("rendered Compose services are unavailable")
    mqtt = rendered["services"].get("mqtt")
    if not isinstance(mqtt, dict) or not isinstance(mqtt.get("volumes"), list):
        raise LifecycleError("MQTT PKI mounts are unavailable")
    pki_mounts = [mount for mount in mqtt["volumes"] if is_pki_mount(mount)]
    if not pki_mounts or not all(valid_pki_source(mount) for mount in pki_mounts):
        raise LifecycleError("required internal PKI source is unavailable")


def is_pki_mount(mount: object) -> bool:
    return isinstance(mount, dict) and str(mount.get("target", "")).startswith("/run/secrets/gcs-pki")


def valid_pki_source(mount: dict[str, object]) -> bool:
    source = Path(str(mount.get("source", "")))
    target = str(mount.get("target", ""))
    if target == "/run/secrets/gcs-pki":
        return source.is_dir() and (source / "ca.crl").is_file() and (source / "ca.crl").stat().st_size > 0
    return source.is_file() and source.stat().st_size > 0


def emit_event(operation: str, service: str, result: str, started: float) -> None:
    fields = {
        "operation": operation,
        "service": service,
        "result": result,
        "durationMs": max(0, round((time.monotonic() - started) * 1000)),
        "errorCode": "none",
    }
    print(json.dumps(fields, separators=(",", ":")))


def emit_failure(error: Exception) -> None:
    fields = {
        "operation": "compose_lifecycle",
        "result": "failed",
        "durationMs": 0,
        "errorCode": "lifecycle_rejected",
        "message": str(error),
    }
    print(json.dumps(fields, separators=(",", ":")), file=sys.stderr)


def plan(action: str) -> dict[str, object]:
    services = [service for service, _ in START_PHASES] if action == "start" else list(STOP_SERVICES)
    return {"action": action, "services": services, "recreatesContainers": False}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("action", choices=("check", "plan-start", "plan-stop", "start", "stop"))
    parser.add_argument("--compose-file", type=Path, required=True)
    parser.add_argument("--env-file", type=Path, required=True)
    parser.add_argument("--project-name", default="gcs-saker-m2-production")
    parser.add_argument("--deployment-target", default="")
    parser.add_argument("--wait-seconds", type=int, default=180)
    parser.add_argument("--poll-seconds", type=float, default=2)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    config = LifecycleConfig(
        compose_file=args.compose_file,
        env_file=args.env_file,
        project_name=args.project_name,
        deployment_target=args.deployment_target,
        wait_seconds=args.wait_seconds,
        poll_seconds=args.poll_seconds,
    )
    try:
        if args.action.startswith("plan-"):
            config.validate()
            print(json.dumps(plan(args.action.removeprefix("plan-")), separators=(",", ":")))
            return 0
        lifecycle = ComposeLifecycle(config, SubprocessRunner())
        getattr(lifecycle, args.action)()
        return 0
    except (OSError, ValueError, json.JSONDecodeError, subprocess.SubprocessError, LifecycleError) as exc:
        emit_failure(exc)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
