#!/usr/bin/env python3
"""Compatibility entrypoint; canonical implementation lives under scripts/reports/generate_test_report.py."""

from pathlib import Path
from runpy import run_path

run_path(
    str(Path(__file__).resolve().parent / "reports" / "generate_test_report.py"),
    run_name="__main__",
)
