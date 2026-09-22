#!/usr/bin/env python3
"""Block known EOL runtimes and undeclared unused-dependency exceptions."""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any

import yaml

ROOT = Path(__file__).resolve().parents[2]
POLICY = ROOT / "docs/compliance/supply-chain/runtime-lifecycle-policy.yml"
CI = ROOT / ".github/workflows/ci.yml"
DASHBOARD_DOCKERFILE = ROOT / "gcs-dashboard/Dockerfile"
BACKEND_DOCKERFILE = ROOT / "backend/Dockerfile"
BACKEND_PYTHON_VERSION = ROOT / "backend/.python-version"
AUTH_DOCKERFILE = ROOT / "services/auth-policy/Dockerfile"
AUTH_BUILD = ROOT / "services/auth-policy/build.gradle.kts"
MEDIA_DOCKERFILE = ROOT / "services/media-control/Dockerfile"
MEDIA_GO_MOD = ROOT / "services/media-control/go.mod"
RELEASE_WORKFLOW = ROOT / ".github/workflows/release-supply-chain.yml"


class RuntimeLifecycleError(RuntimeError):
    pass


def load_policy() -> dict[str, Any]:
    value = yaml.safe_load(POLICY.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise RuntimeLifecycleError("runtime lifecycle policy must be an object")
    return value


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def extract_versions(pattern: str, *sources: str) -> list[tuple[int, ...]]:
    return [version_tuple(value) for source in sources for value in re.findall(pattern, source)]


def version_tuple(value: str) -> tuple[int, ...]:
    return tuple(int(part) for part in value.split("."))


def runtime_versions() -> dict[str, list[tuple[int, ...]]]:
    ci = read(CI)
    return {
        "node": extract_versions(
            r'(?:node-version:\s*["\']?|FROM node:)(\d+(?:\.\d+)*)', ci, read(DASHBOARD_DOCKERFILE)
        ),
        "python": extract_versions(
            r'(?:python-version:\s*["\']?|FROM python:)(\d+(?:\.\d+)*)', ci, read(BACKEND_DOCKERFILE)
        )
        + [version_tuple(read(BACKEND_PYTHON_VERSION).strip())],
        "java": extract_versions(
            r'(?:java-version:\s*["\']?|jdk|amazoncorretto:|JavaLanguageVersion\.of\()(\d+(?:\.\d+)*)',
            ci,
            read(AUTH_DOCKERFILE),
            read(AUTH_BUILD),
        ),
        "go": extract_versions(r"(?:^go\s+|FROM golang:)(\d+(?:\.\d+)*)", read(MEDIA_GO_MOD), read(MEDIA_DOCKERFILE)),
    }


def validate_runtime_versions(policy: dict[str, Any]) -> None:
    minimum = policy.get("minimumSupported", {})
    denied = policy.get("deniedMajors", {})
    for runtime, versions in runtime_versions().items():
        required = version_tuple(str(minimum.get(runtime, "0")))
        denied_majors = {int(value) for value in denied.get(runtime, [])}
        if not versions or any(version < required or version[0] in denied_majors for version in versions):
            rendered = [".".join(map(str, version)) for version in versions]
            raise RuntimeLifecycleError(
                f"{runtime} runtime must be supported and at least {minimum[runtime]}: {rendered}"
            )


def validate(policy: dict[str, Any]) -> None:
    validate_runtime_versions(policy)
    if policy.get("unusedDependencyExceptions") != []:
        raise RuntimeLifecycleError("unused dependency exceptions require explicit policy support")
    workflows = CI.read_text(encoding="utf-8") + RELEASE_WORKFLOW.read_text(encoding="utf-8")
    for obsolete in (
        "actions/checkout@v4",
        "actions/checkout@11d5960a326750d5838078e36cf38b85af677262",
        "actions/setup-node@v4",
        "actions/setup-python@v5",
    ):
        if obsolete in workflows:
            raise RuntimeLifecycleError(f"workflow uses an obsolete action runtime: {obsolete}")


def main() -> int:
    validate(load_policy())
    print("runtime lifecycle policy passed")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except RuntimeLifecycleError as error:
        print(f"runtime lifecycle gate failed: {error}", file=__import__("sys").stderr)
        raise SystemExit(1)
