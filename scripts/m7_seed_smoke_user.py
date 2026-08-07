#!/usr/bin/env python3
"""Compatibility entrypoint; canonical implementation lives under scripts/smoke."""

from pathlib import Path
from runpy import run_path

run_path(
    str(Path(__file__).resolve().parent / "smoke" / "m7_seed_smoke_user.py"),
    run_name="__main__",
)
