#!/usr/bin/env python3
"""Reject flat production directories before they become unbounded grab bags."""

from __future__ import annotations

import sys
from collections import Counter
from pathlib import Path

MAX_PRODUCTION_FILES_PER_DIRECTORY = 30
SOURCE_SUFFIXES = {".go", ".java", ".kt", ".py", ".scss", ".ts", ".tsx"}
SCAN_ROOTS = (
    "backend",
    "gcs-dashboard/src",
    "services/auth-policy/src/main",
    "services/media-control",
)
IGNORED_PARTS = {"generated", "migration", "node_modules", "test", "tests"}


def production_source_files(repository_root: Path):
    for relative_root in SCAN_ROOTS:
        root = repository_root / relative_root
        for path in root.rglob("*"):
            if not path.is_file() or path.suffix not in SOURCE_SUFFIXES:
                continue
            relative = path.relative_to(repository_root)
            if any(part in IGNORED_PARTS for part in relative.parts):
                continue
            if path.name.endswith((".test.ts", ".test.tsx", "_test.go", "Test.kt")):
                continue
            yield relative


def density_violations(repository_root: Path) -> list[str]:
    counts = Counter(
        path.parent.as_posix() for path in production_source_files(repository_root)
    )
    return [
        f"{directory}: {count} production files (maximum {MAX_PRODUCTION_FILES_PER_DIRECTORY})"
        for directory, count in sorted(counts.items())
        if count > MAX_PRODUCTION_FILES_PER_DIRECTORY
    ]


def main() -> int:
    repository_root = Path(__file__).resolve().parents[2]
    violations = density_violations(repository_root)
    if violations:
        print("Directory density contract failed:")
        print("\n".join(f"- {violation}" for violation in violations))
        return 1
    print("Directory density contract passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
