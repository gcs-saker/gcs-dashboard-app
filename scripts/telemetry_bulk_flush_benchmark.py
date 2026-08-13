#!/usr/bin/env python3
"""Compatibility entrypoint; canonical implementation lives under scripts/benchmarks/telemetry_bulk_flush_benchmark.py."""

from pathlib import Path
from runpy import run_path

run_path(
    str(Path(__file__).resolve().parent / "benchmarks" / "telemetry_bulk_flush_benchmark.py"),
    run_name="__main__",
)
