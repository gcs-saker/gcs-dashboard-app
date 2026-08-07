#!/usr/bin/env python3
"""Compatibility entrypoint; canonical implementation lives under scripts/github."""

from pathlib import Path
from runpy import run_path

run_path(str(Path(__file__).resolve().parent / "github" / "create_milestones.py"), run_name="__main__")
