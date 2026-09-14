#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import yaml

REPO_ROOT = Path(__file__).resolve().parents[2]
PROFILE_PATH = REPO_ROOT / "docs/compliance/quality/performance-stability-qualification-profile.yml"
INPUT_SCHEMA = "gcs-saker.performance-samples.v1"
OUTPUT_SCHEMA = "gcs-saker.performance-qualification-result.v1"
REQUIRED_TARGET = "server01-production"


class PerformanceQualificationError(RuntimeError):
    pass


def load_object(path: Path) -> dict[str, Any]:
    loader = json.loads if path.suffix == ".json" else yaml.safe_load
    document = loader(path.read_text(encoding="utf-8"))
    if not isinstance(document, dict):
        raise PerformanceQualificationError(f"{path.name} must contain an object")
    return document


def validate_profile(profile: dict[str, Any]) -> None:
    if profile.get("status") != "CONTROLLED_DRAFT_NOT_EXECUTED":
        raise PerformanceQualificationError("qualification profile must remain an unexecuted draft")
    if profile.get("target") != REQUIRED_TARGET:
        raise PerformanceQualificationError("only Server-01 production is permitted")
    thresholds = profile.get("thresholds", {})
    if thresholds.get("status") != "PROPOSED_NOT_APPROVED":
        raise PerformanceQualificationError("thresholds must remain proposed")
    sampling = profile.get("sampling", {})
    if sampling.get("minimumMeasuredSamplesPerMetric", 0) < 30 or sampling.get("retainRawSamples") is not True:
        raise PerformanceQualificationError("at least 30 retained raw samples are required")


def percentile(values: list[float], ratio: float) -> float:
    ordered = sorted(values)
    index = round((len(ordered) - 1) * ratio)
    return ordered[index]


def validate_samples(values: Any, minimum: int) -> list[float]:
    if not isinstance(values, list) or len(values) < minimum:
        raise PerformanceQualificationError(f"each metric requires at least {minimum} measured samples")
    if any(not isinstance(value, (int, float)) or isinstance(value, bool) or value < 0 for value in values):
        raise PerformanceQualificationError("latency samples must be non-negative numbers")
    return [float(value) for value in values]


def summarize_metric(metric: dict[str, Any], profile: dict[str, Any]) -> dict[str, Any]:
    category = metric.get("category")
    if category not in profile["requiredMetricCategories"]:
        raise PerformanceQualificationError(f"unsupported metric category: {category}")
    samples = validate_samples(
        metric.get("samplesMilliseconds"), profile["sampling"]["minimumMeasuredSamplesPerMetric"]
    )
    errors = metric.get("requestErrors")
    backpressure = metric.get("backpressureEvents")
    queue_depth = metric.get("queueDepthSamples")
    if not isinstance(errors, int) or errors < 0 or not isinstance(backpressure, int) or backpressure < 0:
        raise PerformanceQualificationError("error and backpressure counts must be non-negative integers")
    if (
        not isinstance(queue_depth, list)
        or not queue_depth
        or any(not isinstance(value, int) or isinstance(value, bool) or value < 0 for value in queue_depth)
    ):
        raise PerformanceQualificationError("queue-depth samples are required")
    threshold_key = (
        "controlPlaneLatencyP95Milliseconds"
        if category == "control-plane"
        else "telemetryAcceptanceLatencyP95Milliseconds"
    )
    p95 = percentile(samples, 0.95)
    return {
        "id": metric.get("id"),
        "category": category,
        "sampleCount": len(samples),
        "requestErrors": errors,
        "backpressureEvents": backpressure,
        "queueDepthMaximum": max(queue_depth),
        "p50Milliseconds": percentile(samples, 0.50),
        "p95Milliseconds": p95,
        "p99Milliseconds": percentile(samples, 0.99),
        "proposedThresholdMilliseconds": profile["thresholds"][threshold_key],
        "technicalResult": "PASS"
        if p95 <= profile["thresholds"][threshold_key] and errors == 0 and backpressure == 0
        else "FAIL",
    }


def summarize_continuous(payload: dict[str, Any], profile: dict[str, Any]) -> dict[str, Any]:
    duration = payload.get("durationSeconds")
    disconnects = payload.get("disconnectEvents")
    reconnects = payload.get("reconnectSuccesses")
    resources = payload.get("resourceSamples")
    if not isinstance(duration, (int, float)) or duration < 0:
        raise PerformanceQualificationError("continuous-operation duration is invalid")
    if not isinstance(disconnects, int) or not isinstance(reconnects, int) or reconnects > disconnects:
        raise PerformanceQualificationError("disconnect and reconnect counts are invalid")
    if not isinstance(resources, list) or not resources:
        raise PerformanceQualificationError("resource samples are required")
    cpu_samples = resource_values(resources, "cpuPercent")
    memory_samples = resource_values(resources, "memoryPercent")
    unrecovered = disconnects - reconnects
    full_duration = duration >= profile["thresholds"]["continuousOperationSeconds"]
    return {
        "durationSeconds": duration,
        "disconnectEvents": disconnects,
        "reconnectSuccesses": reconnects,
        "unrecoveredDisconnects": unrecovered,
        "resourceSampleCount": len(resources),
        "cpuPercentMaximum": max(cpu_samples),
        "memoryPercentMaximum": max(memory_samples),
        "fullDurationObserved": full_duration,
        "technicalResult": "PASS" if full_duration and unrecovered == 0 else "FAIL",
    }


def resource_values(resources: list[Any], field: str) -> list[float]:
    values = [item.get(field) for item in resources if isinstance(item, dict)]
    if len(values) != len(resources) or any(
        not isinstance(value, (int, float)) or isinstance(value, bool) or value < 0 for value in values
    ):
        raise PerformanceQualificationError(f"resource samples require non-negative {field}")
    return [float(value) for value in values]


def validate_envelope(document: dict[str, Any], source_commit: str, profile: dict[str, Any]) -> None:
    if document.get("schemaVersion") != INPUT_SCHEMA or document.get("sourceCommit") != source_commit:
        raise PerformanceQualificationError("input schema or source commit does not match")
    if document.get("target") != REQUIRED_TARGET:
        raise PerformanceQualificationError("evidence must target Server-01 production")
    origin = urlparse(str(document.get("publicOrigin", "")))
    if origin.scheme != "https" or origin.hostname != "gcs-saker.com":
        raise PerformanceQualificationError("evidence must use the production HTTPS origin")
    if not document.get("approvedWindowId") or not document.get("loadProfileId"):
        raise PerformanceQualificationError("approved window and load profile IDs are required")
    clock = document.get("clock", {})
    drift = clock.get("measuredDriftMilliseconds")
    if not clock.get("source") or not isinstance(drift, (int, float)) or isinstance(drift, bool):
        raise PerformanceQualificationError("clock source and measured drift are required")
    if document.get("warmupSamples", 0) < profile["sampling"]["minimumWarmupSamples"]:
        raise PerformanceQualificationError("insufficient warmup samples")
    environment = document.get("environment")
    if not isinstance(environment, dict) or any(
        not environment.get(field) for field in profile["requiredEnvironmentFields"]
    ):
        raise PerformanceQualificationError("environment qualification fields are incomplete")


def build_report(document: dict[str, Any], source_commit: str, profile: dict[str, Any]) -> dict[str, Any]:
    validate_envelope(document, source_commit, profile)
    metrics = document.get("metrics")
    if not isinstance(metrics, list) or not metrics:
        raise PerformanceQualificationError("metric evidence is required")
    summaries = [summarize_metric(metric, profile) for metric in metrics]
    categories = {item["category"] for item in summaries}
    if categories != set(profile["requiredMetricCategories"]):
        raise PerformanceQualificationError("required metric category coverage is incomplete")
    continuous = summarize_continuous(document.get("continuousOperation", {}), profile)
    technical_result = "PASS" if all(item["technicalResult"] == "PASS" for item in [*summaries, continuous]) else "FAIL"
    environment = document["environment"]
    return {
        "schemaVersion": OUTPUT_SCHEMA,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "sourceCommit": source_commit,
        "target": REQUIRED_TARGET,
        "approvedWindowId": document["approvedWindowId"],
        "loadProfileId": document["loadProfileId"],
        "clock": {
            "source": document["clock"]["source"],
            "measuredDriftMilliseconds": document["clock"]["measuredDriftMilliseconds"],
        },
        "environment": {field: environment[field] for field in profile["requiredEnvironmentFields"]},
        "thresholdStatus": profile["thresholds"]["status"],
        "metrics": summaries,
        "continuousOperation": continuous,
        "technicalResult": technical_result,
        "verdict": "BLOCKED" if technical_result == "PASS" else "FAIL",
        "limitations": ["thresholds, load profile, and independent assessment are not approved"],
    }


def write_immutable(path: Path, report: dict[str, Any]) -> None:
    if not path.is_absolute() or not path.parent.is_dir():
        raise PerformanceQualificationError("output must use an existing absolute directory")
    with path.open("x", encoding="utf-8") as stream:
        json.dump(report, stream, indent=2)
        stream.write("\n")


def source_commit() -> str:
    completed = subprocess.run(
        ["git", "rev-parse", "HEAD"], cwd=REPO_ROOT, check=True, capture_output=True, text=True, timeout=10
    )
    return completed.stdout.strip()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--input", type=Path)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    profile = load_object(PROFILE_PATH)
    validate_profile(profile)
    if args.check:
        print("performance and stability qualification profile passed")
        return 0
    if not args.input or not args.output:
        parser.error("--input and --output are required")
    if not args.input.is_absolute() or not args.input.is_file():
        raise PerformanceQualificationError("input must be an existing absolute file")
    current_commit = source_commit()
    report = build_report(load_object(args.input), current_commit, profile)
    report["inputSha256"] = hashlib.sha256(args.input.read_bytes()).hexdigest()
    write_immutable(args.output, report)
    print(json.dumps({"technicalResult": report["technicalResult"], "verdict": report["verdict"]}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
