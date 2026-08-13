#!/usr/bin/env python3
"""Reject tracked source and documentation files that are not valid UTF-8."""

from __future__ import annotations

import pathlib
import subprocess

ROOT = pathlib.Path(__file__).resolve().parents[2]
TEXT_SUFFIXES = {
    ".cjs",
    ".conf",
    ".css",
    ".env",
    ".go",
    ".html",
    ".js",
    ".json",
    ".jsx",
    ".kt",
    ".kts",
    ".md",
    ".mjs",
    ".py",
    ".sh",
    ".sql",
    ".ts",
    ".tsx",
    ".txt",
    ".xml",
    ".yaml",
    ".yml",
}
TEXT_NAMES = {"Caddyfile", "Dockerfile", "Makefile"}


def tracked_text_paths() -> list[pathlib.Path]:
    output = subprocess.check_output(["git", "ls-files", "-z"], cwd=ROOT)
    paths = []
    for encoded_path in output.split(b"\0"):
        if not encoded_path:
            continue
        path = ROOT / encoded_path.decode("utf-8")
        if path.is_file() and (
            path.suffix.lower() in TEXT_SUFFIXES
            or path.name in TEXT_NAMES
            or path.name.startswith("Caddyfile")
        ):
            paths.append(path)
    return paths


def main() -> int:
    invalid = []
    for path in tracked_text_paths():
        try:
            path.read_text(encoding="utf-8")
        except UnicodeDecodeError as error:
            invalid.append(f"{path.relative_to(ROOT)}: {error}")
    if invalid:
        raise SystemExit("tracked text is not UTF-8:\n" + "\n".join(invalid))
    print(f"UTF-8 contract passed for {len(tracked_text_paths())} tracked text files")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
