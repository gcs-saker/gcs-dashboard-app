#!/usr/bin/env python3
"""Compatibility entrypoint; canonical implementation lives under scripts/benchmarks/streaming_core_perf_check.py."""

from pathlib import Path
from runpy import run_path

run_path(
    str(
        Path(__file__).resolve().parent / "benchmarks" / "streaming_core_perf_check.py"
    ),
    run_name="__main__",
)
