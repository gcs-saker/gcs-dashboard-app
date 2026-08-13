#!/usr/bin/env python3
"""Compatibility entrypoint; canonical implementation lives under scripts/benchmarks."""

from pathlib import Path
from runpy import run_path

run_path(
    str(Path(__file__).resolve().parent / "benchmarks" / "m7_db_query_plan_contract.py"),
    run_name="__main__",
)
