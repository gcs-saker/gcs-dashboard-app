#!/usr/bin/env python3
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RUNTIME_REQUIREMENTS = ROOT / "backend/requirements-runtime.txt"
DEVELOPMENT_REQUIREMENTS = ROOT / "backend/requirements.txt"


class PythonDependencyError(RuntimeError):
    pass


def requirement_names(path: Path) -> set[str]:
    names: set[str] = set()
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.split("#", maxsplit=1)[0].strip()
        if not line or line.startswith(("-", "--")):
            continue
        name = re.split(r"\[|===|==|~=|!=|<=|>=|<|>|@", line, maxsplit=1)[0]
        names.add(re.sub(r"[-_.]+", "-", name).lower())
    return names


def validate(runtime_path: Path, development_path: Path) -> None:
    duplicate_names = sorted(requirement_names(runtime_path) & requirement_names(development_path))
    if duplicate_names:
        raise PythonDependencyError(
            f"development requirements duplicate runtime packages: {', '.join(duplicate_names)}"
        )


def main() -> int:
    validate(RUNTIME_REQUIREMENTS, DEVELOPMENT_REQUIREMENTS)
    print("python dependency declarations passed")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except PythonDependencyError as error:
        print(f"python dependency gate failed: {error}", file=__import__("sys").stderr)
        raise SystemExit(1)
