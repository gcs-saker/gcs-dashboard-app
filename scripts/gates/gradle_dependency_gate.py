#!/usr/bin/env python3
from __future__ import annotations

import re
from pathlib import Path
from typing import Any

import yaml

ROOT = Path(__file__).resolve().parents[2]
BUILD_FILE = ROOT / "services/auth-policy/build.gradle.kts"
INVENTORY = ROOT / "docs/compliance/supply-chain/auth-policy-dependencies.yml"
DEPENDENCY_PATTERN = re.compile(
    r'^\s*(implementation|compileOnly|testImplementation|runtimeOnly)\("([^"]+)"\)',
    re.MULTILINE,
)


class GradleDependencyError(RuntimeError):
    pass


def declared_dependencies(build_text: str) -> set[tuple[str, str]]:
    return {(match.group(1), match.group(2)) for match in DEPENDENCY_PATTERN.finditer(build_text)}


def load_inventory(path: Path) -> list[dict[str, Any]]:
    document = yaml.safe_load(path.read_text(encoding="utf-8"))
    dependencies = document.get("dependencies") if isinstance(document, dict) else None
    if not isinstance(dependencies, list):
        raise GradleDependencyError("dependency inventory must contain a dependency list")
    return dependencies


def validate(build_text: str, inventory: list[dict[str, Any]]) -> None:
    owned: set[tuple[str, str]] = set()
    for item in inventory:
        key = (str(item.get("configuration", "")), str(item.get("coordinate", "")))
        if not all(key) or not str(item.get("reason", "")).strip():
            raise GradleDependencyError("every dependency requires configuration, coordinate, and reason")
        if key in owned:
            raise GradleDependencyError(f"duplicate dependency inventory entry: {key[1]}")
        owned.add(key)
    declared = declared_dependencies(build_text)
    if declared != owned:
        missing = sorted(declared - owned)
        stale = sorted(owned - declared)
        raise GradleDependencyError(f"dependency ownership mismatch; missing={missing}; stale={stale}")


def main() -> int:
    validate(BUILD_FILE.read_text(encoding="utf-8"), load_inventory(INVENTORY))
    print("Gradle dependency ownership passed")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except GradleDependencyError as error:
        print(f"Gradle dependency gate failed: {error}", file=__import__("sys").stderr)
        raise SystemExit(1)
