#!/usr/bin/env python3
"""Prevent the reusable streaming feature from depending on dashboard presentation code."""

from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
STREAMING_ROOT = REPO_ROOT / "gcs-dashboard" / "src" / "features" / "streaming"
FORBIDDEN_IMPORTS = ('from "@dashboard/', "from '@dashboard/", "features/dashboard")


def main() -> int:
    violations: list[str] = []
    for path in STREAMING_ROOT.rglob("*"):
        if path.suffix not in {".ts", ".tsx"}:
            continue
        text = path.read_text(encoding="utf-8")
        if any(marker in text for marker in FORBIDDEN_IMPORTS):
            violations.append(str(path.relative_to(REPO_ROOT)))
    if violations:
        print("streaming-to-dashboard dependency is forbidden:")
        print("\n".join(violations))
        return 1
    print("frontend boundary contract passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
