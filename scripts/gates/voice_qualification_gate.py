#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path
from typing import Any

import yaml

ROOT = Path(__file__).resolve().parents[2]
RESULTS = ROOT / "docs/compliance/voice/voice-qualification-results.yml"
REQUIRED_SOFTWARE = {
    "VOICE-SW-CAPTURE-POLICY",
    "VOICE-SW-OPUS-POLICY",
    "VOICE-SW-AUTHORIZED-ROUTING",
    "VOICE-SW-INBOUND-WAVEFORM",
    "VOICE-SW-JITTER-LOSS-CONCEALMENT",
    "VOICE-SW-RECONNECT-STATE",
    "VOICE-SW-TALKBACK-LATENCY-BUDGET",
}


class VoiceQualificationError(RuntimeError):
    pass


def load_results() -> dict[str, Any]:
    value = yaml.safe_load(RESULTS.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise VoiceQualificationError("voice qualification results must be an object")
    return value


def validate() -> int:
    results = load_results()
    checks = {str(item.get("id")): item for item in results.get("softwareChecks", [])}
    if set(checks) != REQUIRED_SOFTWARE:
        raise VoiceQualificationError("voice software evidence inventory is incomplete")
    for check in checks.values():
        if check.get("status") != "PASS" or not (ROOT / str(check.get("evidence", ""))).is_file():
            raise VoiceQualificationError(f"voice software check is not proven: {check.get('id')}")
    if results.get("overallStatus") != "BLOCKED" or results.get("humanIntelligibility", {}).get("status") != "BLOCKED":
        raise VoiceQualificationError("physical intelligibility must remain BLOCKED without evidence")
    matrix = results.get("qualificationMatrix", {})
    if matrix.get("status") != "NOT_RUN" or matrix.get("packetLossPercent") != [0, 1, 3, 5]:
        raise VoiceQualificationError("impairment matrix status is overstated or incomplete")
    return len(checks)


if __name__ == "__main__":
    try:
        print(f"voice qualification software gate passed for {validate()} checks; physical verdict remains BLOCKED")
    except VoiceQualificationError as error:
        print(f"voice qualification gate failed: {error}", file=__import__("sys").stderr)
        raise SystemExit(1)
