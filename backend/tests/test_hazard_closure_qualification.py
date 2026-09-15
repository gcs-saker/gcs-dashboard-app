import json
import runpy
from datetime import date
from pathlib import Path
from typing import Any, Callable, cast

import pytest

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts/reports/hazard_closure_qualification.py"
PROFILE_PATH = ROOT / "docs/compliance/safety/hazard-closure-qualification.yml"
MODULE = runpy.run_path(str(SCRIPT))
HazardClosureError = cast(type[BaseException], MODULE["HazardClosureError"])
load_object = cast(Callable[[Path], dict[str, Any]], MODULE["load_object"])
validate_profile = cast(Callable[[dict[str, Any]], None], MODULE["validate_profile"])
build_report = cast(Callable[..., dict[str, Any]], MODULE["build_report"])
evaluate_hazards = cast(Callable[..., dict[str, Any]], MODULE["evaluate_hazards"])
load_manifests = cast(Callable[..., dict[str, dict[str, Any]]], MODULE["load_manifests"])
write_immutable = cast(Callable[[Path, dict[str, Any]], None], MODULE["write_immutable"])
COMMIT = "a" * 40


def profile() -> dict[str, Any]:
    result = load_object(PROFILE_PATH)
    validate_profile(result)
    return result


def hazard(status: str = "OPEN") -> dict[str, Any]:
    return {"id": "HAZ-ONE", "status": status, "safetyRequirements": ["SR-ONE"]}


def accepted_record(review_due: str = "2027-01-01") -> dict[str, Any]:
    return {
        "hazardId": "HAZ-ONE",
        "residualRisk": "LOW",
        "disposition": "ACCEPT",
        "acceptanceAuthority": "system-safety-authority",
        "acceptedAt": "2026-09-01",
        "reviewDueAt": review_due,
        "sourceCommit": COMMIT,
        "verifiedControlRequirementIds": ["SR-ONE"],
        "evidenceManifestIds": ["EVIDENCE-ONE"],
    }


def pass_manifest() -> dict[str, Any]:
    return {
        "evidenceId": "EVIDENCE-ONE",
        "sourceCommit": COMMIT,
        "verdict": "PASS",
        "hazardIds": ["HAZ-ONE"],
        "generatedAt": "2026-09-15T00:00:00Z",
        "environment": "controlled-test",
        "procedure": "safety-control-test",
        "expectedResult": "control prevents hazard",
        "actualResult": "control verified",
        "reviewer": "independent-reviewer",
        "artifacts": [{"sha256": "c" * 64, "immutableLocator": "evidence://artifact/one"}],
    }


def test_current_baseline_truthfully_reports_zero_closed_hazards() -> None:
    result = build_report(profile(), [], COMMIT, date(2026, 9, 15))

    assert result["hazardCount"] == 10
    assert result["closedHazardCount"] == 0
    assert result["closureRatio"] == 0
    assert result["technicalResult"] == "BLOCKED"
    assert len(result["untracedHazardIds"]) == 5


def test_complete_closed_hazard_is_technical_pass_but_not_approved() -> None:
    result = evaluate_hazards(
        {"HAZ-ONE": hazard("CLOSED")},
        {"HAZ-ONE": accepted_record()},
        {"HAZ-ONE": ["MR-SAF-001"]},
        {"EVIDENCE-ONE": pass_manifest()},
        COMMIT,
        date(2026, 9, 15),
    )

    assert result["closureRatio"] == 1
    assert result["technicalResult"] == "PASS"
    assert result["verdict"] == "BLOCKED"


@pytest.mark.parametrize(
    ("record", "manifest", "blocker"),
    [
        (accepted_record("2026-09-14"), pass_manifest(), "acceptance-expired"),
        ({**accepted_record(), "verifiedControlRequirementIds": []}, pass_manifest(), "safety-controls-unverified"),
        (accepted_record(), {**pass_manifest(), "verdict": "FAIL"}, "evidence-not-pass-or-hazard-mismatch"),
    ],
)
def test_invalid_declared_closure_fails(record: dict[str, Any], manifest: dict[str, Any], blocker: str) -> None:
    result = evaluate_hazards(
        {"HAZ-ONE": hazard("CLOSED")},
        {"HAZ-ONE": record},
        {"HAZ-ONE": ["MR-SAF-001"]},
        {"EVIDENCE-ONE": manifest},
        COMMIT,
        date(2026, 9, 15),
    )

    assert blocker in result["hazards"][0]["blockers"]
    assert result["verdict"] == "FAIL"


def test_manifest_source_commit_mismatch_is_rejected(tmp_path: Path) -> None:
    path = tmp_path / "manifest.json"
    path.write_text(
        json.dumps({"schemaVersion": "gcs-saker.evidence-manifest.v1", **pass_manifest()}), encoding="utf-8"
    )

    with pytest.raises(HazardClosureError, match="source commit mismatch"):
        load_manifests([path], "b" * 40)


def test_empty_pass_manifest_cannot_close_a_hazard(tmp_path: Path) -> None:
    path = tmp_path / "manifest.json"
    document = {"schemaVersion": "gcs-saker.evidence-manifest.v1", **pass_manifest(), "artifacts": []}
    path.write_text(json.dumps(document), encoding="utf-8")

    with pytest.raises(HazardClosureError, match="no retained artifacts"):
        load_manifests([path], COMMIT)


def test_output_is_immutable(tmp_path: Path) -> None:
    output = tmp_path / "closure.json"
    write_immutable(output, {"verdict": "BLOCKED"})

    with pytest.raises(FileExistsError):
        write_immutable(output, {"verdict": "PASS"})
