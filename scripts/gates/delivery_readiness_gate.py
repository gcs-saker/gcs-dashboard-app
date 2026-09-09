#!/usr/bin/env python3
from __future__ import annotations

import json
import subprocess
from pathlib import Path
from typing import Any

import yaml

ROOT = Path(__file__).resolve().parents[2]
READINESS = ROOT / "docs/operations/delivery-readiness.yml"
MANUAL = ROOT / "docs/operations/GCS-Saker_v1_Delivery_Operations_Manual.md"
CANDIDATE = ROOT / "docs/releases/v1.0.0-candidate.md"
ITEMS = {f"DLV-{index:02d}" for index in range(1, 7)}
STATUSES = {"PASS", "FAIL", "BLOCKED", "NOT_RUN"}


class DeliveryReadinessError(RuntimeError):
    pass


def load_readiness() -> dict[str, Any]:
    value = yaml.safe_load(READINESS.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise DeliveryReadinessError("delivery readiness must be an object")
    return value


def validate() -> dict[str, int]:
    readiness = load_readiness()
    items = {str(item.get("id")): item for item in readiness.get("items", [])}
    if set(items) != ITEMS:
        raise DeliveryReadinessError("DLV-01 through DLV-06 must exist exactly once")
    counts = {status: 0 for status in STATUSES}
    for item in items.values():
        status = str(item.get("status"))
        if status not in STATUSES or not item.get("evidence"):
            raise DeliveryReadinessError(f"invalid delivery item: {item.get('id')}")
        if any(not (ROOT / str(path)).exists() for path in item["evidence"]):
            raise DeliveryReadinessError(f"delivery evidence is missing: {item.get('id')}")
        counts[status] += 1
    blocked = counts["FAIL"] + counts["BLOCKED"] + counts["NOT_RUN"]
    if readiness.get("releaseTagAllowed") != (blocked == 0):
        raise DeliveryReadinessError("release tag decision does not match item verdicts")
    if readiness.get("overallStatus") != ("PASS" if blocked == 0 else "BLOCKED"):
        raise DeliveryReadinessError("overall delivery status does not match item verdicts")
    if not MANUAL.is_file() or not CANDIDATE.is_file():
        raise DeliveryReadinessError("delivery manual or release candidate is missing")
    tags = subprocess.run(["git", "tag", "--list", "v1.0.0"], cwd=ROOT, capture_output=True, text=True, check=True)
    if blocked and tags.stdout.strip():
        raise DeliveryReadinessError("v1.0.0 tag exists while delivery is blocked")
    return counts


if __name__ == "__main__":
    try:
        print(json.dumps(validate(), sort_keys=True))
    except DeliveryReadinessError as error:
        print(f"delivery readiness gate failed: {error}", file=__import__("sys").stderr)
        raise SystemExit(1)
