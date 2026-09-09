#!/usr/bin/env python3
"""Classify streaming startup latency against explicit operational budgets."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class LatencyBudget:
    warning_ms: float
    failure_ms: float


BUDGETS = {
    "playback": LatencyBudget(warning_ms=1000.0, failure_ms=2000.0),
    "talkback": LatencyBudget(warning_ms=500.0, failure_ms=1000.0),
}


def classify_latency(profile: str, elapsed_ms: float) -> str:
    budget = BUDGETS[profile]
    if elapsed_ms >= budget.failure_ms:
        return "FAIL"
    if elapsed_ms >= budget.warning_ms:
        return "WARN"
    return "PASS"


def require_latency_budget(profile: str, elapsed_ms: float) -> None:
    result = classify_latency(profile, elapsed_ms)
    if result == "FAIL":
        raise RuntimeError(f"{profile} first-frame latency exceeded {BUDGETS[profile].failure_ms:.0f} ms")
