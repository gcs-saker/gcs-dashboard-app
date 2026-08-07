#!/usr/bin/env python3
"""Compatibility entrypoint; canonical implementation lives under scripts/gates/m10_runtime_evidence_gate.py."""

from pathlib import Path
from runpy import run_path

run_path(
    str(Path(__file__).resolve().parent / "gates" / "m10_runtime_evidence_gate.py"),
    run_name="__main__",
)
