#!/usr/bin/env python3
"""Validate repository structure and naming rules from AGENTS.md."""

from __future__ import annotations

import re
import subprocess
from pathlib import Path

REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
PRODUCTION_ROOTS = (
    REPOSITORY_ROOT / "backend",
    REPOSITORY_ROOT / "gcs-dashboard" / "src",
    REPOSITORY_ROOT / "services" / "auth-policy" / "src" / "main",
    REPOSITORY_ROOT / "services" / "media-control",
)
SOURCE_SUFFIXES = {".go", ".kt", ".py", ".ts", ".tsx"}
MAX_PRODUCTION_LINES = 350
FORBIDDEN_TRACKED_PARTS = {
    ".agents",
    ".benchmarks",
    ".codex",
    ".gradle",
    ".hypothesis",
    ".idea",
    ".mypy_cache",
    ".pytest_cache",
    ".ruff_cache",
    ".vscode",
    "__pycache__",
    "build",
    "coverage",
    "dist",
    "node_modules",
    "playwright-report",
    "test-results",
    "tmp",
}
FORBIDDEN_TRACKED_SUFFIXES = {
    ".bak",
    ".class",
    ".log",
    ".orig",
    ".pid",
    ".pyc",
    ".rej",
    ".tmp",
}


def tracked_files() -> list[Path]:
    result = subprocess.run(
        ["git", "ls-files"],
        cwd=REPOSITORY_ROOT,
        check=True,
        capture_output=True,
        text=True,
        encoding="utf-8",
    )
    return [path for line in result.stdout.splitlines() if line and (path := REPOSITORY_ROOT / line).is_file()]


def is_test_file(path: Path) -> bool:
    relative = path.relative_to(REPOSITORY_ROOT)
    return (
        "tests" in relative.parts
        or ".test." in path.name
        or path.name.endswith("_test.go")
        or path.name.endswith("Test.kt")
    )


def validate_tracked_hygiene(paths: list[Path], errors: list[str]) -> None:
    for path in paths:
        relative = path.relative_to(REPOSITORY_ROOT)
        if FORBIDDEN_TRACKED_PARTS.intersection(relative.parts):
            errors.append(f"generated or personal path is tracked: {relative}")
        if path.suffix.lower() in FORBIDDEN_TRACKED_SUFFIXES:
            errors.append(f"generated artifact is tracked: {relative}")


def validate_python_names(paths: list[Path], errors: list[str]) -> None:
    snake_case = re.compile(r"(?:__init__|[a-z][a-z0-9_]*)\.py$")
    for path in paths:
        if path.suffix == ".py" and not snake_case.fullmatch(path.name):
            errors.append(f"Python module must use snake_case: {path.relative_to(REPOSITORY_ROOT)}")


def validate_kotlin_names(paths: list[Path], errors: list[str]) -> None:
    pascal_case = re.compile(r"[A-Z][A-Za-z0-9]*\.kt$")
    for path in paths:
        if path.suffix == ".kt" and "/src/" in path.as_posix() and not pascal_case.fullmatch(path.name):
            errors.append(f"Kotlin source file must use PascalCase: {path.relative_to(REPOSITORY_ROOT)}")


def validate_production_file_sizes(paths: list[Path], errors: list[str]) -> None:
    for path in paths:
        if path.suffix not in SOURCE_SUFFIXES or is_test_file(path):
            continue
        if not any(path.is_relative_to(root) for root in PRODUCTION_ROOTS):
            continue
        line_count = len(path.read_text(encoding="utf-8").splitlines())
        if line_count > MAX_PRODUCTION_LINES:
            errors.append(
                f"production source exceeds {MAX_PRODUCTION_LINES} lines ({line_count}): "
                f"{path.relative_to(REPOSITORY_ROOT)}"
            )


def main() -> int:
    errors: list[str] = []
    paths = tracked_files()
    validate_tracked_hygiene(paths, errors)
    validate_python_names(paths, errors)
    validate_kotlin_names(paths, errors)
    validate_production_file_sizes(paths, errors)
    if not (REPOSITORY_ROOT / "AGENTS.md").is_file():
        errors.append("AGENTS.md is required at the repository root")
    if errors:
        for error in errors:
            print(f"ERROR: {error}")
        return 1
    print(f"repository hygiene contract passed for {len(paths)} tracked files")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
