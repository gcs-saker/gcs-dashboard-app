#!/usr/bin/env python3
"""Keep production sources cohesive by enforcing the repository's 350-line limit."""

from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
SOURCE_ROOTS = (
    REPO_ROOT / "backend",
    REPO_ROOT / "gcs-dashboard" / "src",
    REPO_ROOT / "services" / "auth-policy" / "src" / "main",
    REPO_ROOT / "services" / "media-control" / "cmd",
    REPO_ROOT / "services" / "media-control" / "internal",
)
SOURCE_SUFFIXES = {".go", ".kt", ".py", ".ts", ".tsx"}
EXCLUDED_PARTS = {"generated", "__pycache__"}
MAX_LINES = 350


def oversized_sources() -> list[tuple[Path, int]]:
    violations: list[tuple[Path, int]] = []
    for root in SOURCE_ROOTS:
        for path in root.rglob("*"):
            if not path.is_file() or path.suffix not in SOURCE_SUFFIXES:
                continue
            if (
                any(part in EXCLUDED_PARTS for part in path.parts)
                or ".test." in path.name
                or "_test." in path.name
                or path.name.endswith("Test.kt")
                or "tests" in path.parts
            ):
                continue
            line_count = len(path.read_text(encoding="utf-8").splitlines())
            if line_count > MAX_LINES:
                violations.append((path, line_count))
    return violations


def main() -> int:
    violations = oversized_sources()
    if violations:
        for path, line_count in violations:
            print(f"{path.relative_to(REPO_ROOT)}: {line_count} lines (maximum {MAX_LINES})")
        return 1
    print("production source size contract passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
