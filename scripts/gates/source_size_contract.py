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
MAX_REACT_COMPONENT_LINES = 150
MAX_REACT_HOOK_LINES = 120


def source_line_limit(path: Path) -> int:
    if path.name.startswith("use") and path.suffix in {".ts", ".tsx"}:
        return MAX_REACT_HOOK_LINES
    if path.suffix == ".tsx":
        return MAX_REACT_COMPONENT_LINES
    return MAX_LINES


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
            limit = source_line_limit(path)
            if line_count > limit:
                violations.append((path, line_count))
    return violations


def main() -> int:
    violations = oversized_sources()
    if violations:
        for path, line_count in violations:
            print(f"{path.relative_to(REPO_ROOT)}: {line_count} lines (maximum {source_line_limit(path)})")
        return 1
    print("production source size contract passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
