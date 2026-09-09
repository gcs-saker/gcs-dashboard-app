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


class RuntimeLifecycleError(RuntimeError):
    pass


def load_policy() -> dict[str, Any]:
    value = yaml.safe_load(POLICY.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise RuntimeLifecycleError("runtime lifecycle policy must be an object")
    return value


def node_versions() -> list[int]:
    sources = (
        CI.read_text(encoding="utf-8"),
        DASHBOARD_DOCKERFILE.read_text(encoding="utf-8"),
    )
    versions = []
    for source in sources:
        versions.extend(
            int(value)
            for value in re.findall(
                r"(?:node-version:\s*[\"']?|FROM node:)(\d+)", source
            )
        )
    return versions


def validate(policy: dict[str, Any]) -> None:
    minimum = int(policy.get("minimumSupported", {}).get("node", 0))
    denied = {int(value) for value in policy.get("deniedMajors", {}).get("node", [])}
    versions = node_versions()
    if not versions or any(
        version < minimum or version in denied for version in versions
    ):
        raise RuntimeLifecycleError(
            f"Node runtime must be supported and at least {minimum}: {versions}"
        )
    if policy.get("unusedDependencyExceptions") != []:
        raise RuntimeLifecycleError(
            "unused dependency exceptions require explicit policy support"
        )


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
