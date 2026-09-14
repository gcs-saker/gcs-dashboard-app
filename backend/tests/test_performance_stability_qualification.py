import json
import runpy
from pathlib import Path
from typing import Any, Callable, cast

import pytest

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts/reports/performance_stability_qualification.py"
PROFILE_PATH = ROOT / "docs/compliance/quality/performance-stability-qualification-profile.yml"
MODULE = runpy.run_path(str(SCRIPT))
QualificationError = cast(type[BaseException], MODULE["PerformanceQualificationError"])
load_object = cast(Callable[[Path], dict[str, Any]], MODULE["load_object"])
validate_profile = cast(Callable[[dict[str, Any]], None], MODULE["validate_profile"])
build_report = cast(Callable[[dict[str, Any], str, dict[str, Any]], dict[str, Any]], MODULE["build_report"])
write_immutable = cast(Callable[[Path, dict[str, Any]], None], MODULE["write_immutable"])
COMMIT = "a" * 40


def evidence(*, samples: int = 30, duration: int = 86400, p95_value: float = 10) -> dict[str, Any]:
    def metric(metric_id: str, category: str) -> dict[str, Any]:
        return {
            "id": metric_id,
            "category": category,
            "samplesMilliseconds": [p95_value] * samples,
            "requestErrors": 0,
            "backpressureEvents": 0,
            "queueDepthSamples": [0, 1],
        }

    return {
        "schemaVersion": "gcs-saker.performance-samples.v1",
        "sourceCommit": COMMIT,
        "target": "server01-production",
        "publicOrigin": "https://gcs-saker.com",
        "approvedWindowId": "window-1",
        "loadProfileId": "load-1",
        "warmupSamples": 5,
        "clock": {"source": "pool.ntp.org:123", "measuredDriftMilliseconds": 2},
        "environment": {
            "deploymentProfile": "single-node-production",
            "hostFingerprint": "private-evidence-ref",
            "imageDigests": ["sha256:example"],
            "datasetProfile": "dataset-1",
            "networkProfile": "network-1",
            "toolVersions": {"collector": "1"},
        },
        "metrics": [metric("control", "control-plane"), metric("telemetry", "telemetry-acceptance")],
        "continuousOperation": {
            "durationSeconds": duration,
            "disconnectEvents": 1,
            "reconnectSuccesses": 1,
            "resourceSamples": [{"cpuPercent": 10, "memoryPercent": 20}],
        },
    }


def profile() -> dict[str, Any]:
    result = load_object(PROFILE_PATH)
    validate_profile(result)
    return result


def test_clean_measurements_are_technical_pass_but_blocked() -> None:
    result = build_report(evidence(), COMMIT, profile())

    assert result["technicalResult"] == "PASS"
    assert result["verdict"] == "BLOCKED"
    assert result["metrics"][0]["p99Milliseconds"] == 10
    assert result["environment"]["deploymentProfile"] == "single-node-production"
    assert result["clock"]["measuredDriftMilliseconds"] == 2


@pytest.mark.parametrize(
    ("samples", "duration", "p95_value", "message"),
    [(29, 86400, 10, "at least 30"), (30, 86399, 10, None), (30, 86400, 501, None)],
)
def test_incomplete_or_over_threshold_evidence_cannot_pass(
    samples: int, duration: int, p95_value: float, message: str | None
) -> None:
    if message:
        with pytest.raises(QualificationError, match=message):
            build_report(evidence(samples=samples, duration=duration, p95_value=p95_value), COMMIT, profile())
        return

    result = build_report(evidence(samples=samples, duration=duration, p95_value=p95_value), COMMIT, profile())
    assert result["verdict"] == "FAIL"


def test_missing_metric_category_is_rejected() -> None:
    document = evidence()
    document["metrics"] = document["metrics"][:1]

    with pytest.raises(QualificationError, match="category coverage"):
        build_report(document, COMMIT, profile())


def test_commit_and_public_origin_are_bound() -> None:
    document = evidence()
    document["publicOrigin"] = "http://127.0.0.1"

    with pytest.raises(QualificationError, match="production HTTPS"):
        build_report(document, COMMIT, profile())
    with pytest.raises(QualificationError, match="source commit"):
        build_report(evidence(), "b" * 40, profile())


def test_incomplete_environment_is_rejected() -> None:
    document = evidence()
    document["environment"].pop("imageDigests")

    with pytest.raises(QualificationError, match="environment qualification"):
        build_report(document, COMMIT, profile())


def test_output_is_immutable(tmp_path: Path) -> None:
    output = tmp_path / "result.json"
    write_immutable(output, {"verdict": "BLOCKED"})

    with pytest.raises(FileExistsError):
        write_immutable(output, json.loads(output.read_text(encoding="utf-8")))
