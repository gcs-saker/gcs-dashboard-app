#!/usr/bin/env python3
"""Compatibility entrypoint; canonical implementation lives under scripts/smoke/webrtc_whip_publish_smoke.py."""

from pathlib import Path
from runpy import run_path

run_path(
    str(Path(__file__).resolve().parent / "smoke" / "webrtc_whip_publish_smoke.py"),
    run_name="__main__",
)
