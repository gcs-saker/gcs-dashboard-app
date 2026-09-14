import json
import runpy
from pathlib import Path
from typing import Any, Callable, cast

import pytest

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts/reports/change_impact_qualification.py"
CATALOGUE_PATH = ROOT / "docs/compliance/architecture/change-impact-ownership.yml"
MODULE = runpy.run_path(str(SCRIPT))
ChangeImpactError = cast(type[BaseException], MODULE["ChangeImpactError"])
load_object = cast(Callable[[Path], dict[str, Any]], MODULE["load_object"])
validate_catalogue = cast(Callable[[dict[str, Any]], dict[str, str]], MODULE["validate_catalogue"])
classify_path = cast(Callable[[str, dict[str, Any], dict[str, str]], str], MODULE["classify_path"])
evaluate_changes = cast(Callable[..., dict[str, Any]], MODULE["evaluate_changes"])
validate_disposition = cast(Callable[..., dict[str, str]], MODULE["validate_disposition"])
write_immutable = cast(Callable[[Path, dict[str, Any]], None], MODULE["write_immutable"])
CANDIDATE = "b" * 40


def catalogue() -> dict[str, Any]:
    result = load_object(CATALOGUE_PATH)
    validate_catalogue(result)
    return result


def test_catalogue_classifies_production_and_test_paths() -> None:
    document = catalogue()
    owners = validate_catalogue(document)

    assert classify_path("services/auth-policy/src/main/App.kt", document, owners) == "auth-policy"
    assert classify_path("services/auth-policy/src/test/AppTest.kt", document, owners) == "non-production"
    assert classify_path("gcs-dashboard/src/App.test.tsx", document, owners) == "non-production"
    assert classify_path("new-service/main.go", document, owners) == "unknown"


def test_single_owner_change_is_technically_clean_but_blocked() -> None:
    result = evaluate_changes(
        ["backend/api/auth.py", "backend/tests/test_auth_api.py", "docs/example.md"],
        catalogue(),
        "backend-compatibility",
        None,
    )

    assert result["modifiedProductionOwners"] == ["backend-compatibility"]
    assert result["technicalResult"] == "PASS"
    assert result["verdict"] == "BLOCKED"


def test_cross_boundary_change_requires_review() -> None:
    paths = ["backend/api/auth.py", "contracts/proto/example.proto"]

    result = evaluate_changes(paths, catalogue(), "backend-compatibility", None)

    assert result["technicalResult"] == "REVIEW_REQUIRED"
    assert result["crossBoundaryProductionOwners"] == ["contracts"]
    assert result["verdict"] == "BLOCKED"


def test_exact_accepted_disposition_allows_technical_pass(tmp_path: Path) -> None:
    disposition_path = tmp_path / "disposition.json"
    disposition_path.write_text(
        json.dumps(
            {
                "candidateCommit": CANDIDATE,
                "changeId": "change-1",
                "crossBoundaryPaths": ["contracts/proto/example.proto"],
                "reviewer": "architecture-reviewer",
                "decision": "ACCEPT",
                "rationale": "contract addition is required by the adapter boundary",
            }
        ),
        encoding="utf-8",
    )
    disposition = validate_disposition(disposition_path, CANDIDATE, "change-1", ["contracts/proto/example.proto"])

    result = evaluate_changes(
        ["backend/api/auth.py", "contracts/proto/example.proto"],
        catalogue(),
        "backend-compatibility",
        disposition,
    )
    assert result["technicalResult"] == "PASS"
    assert result["verdict"] == "BLOCKED"


def test_rejected_disposition_and_unknown_path_fail() -> None:
    rejected = {"reviewer": "reviewer", "decision": "REJECT", "rationale": "boundary leak"}
    rejected_result = evaluate_changes(["backend/api/auth.py"], catalogue(), "backend-compatibility", rejected)
    unknown_result = evaluate_changes(["unknown-root/main.py"], catalogue(), "backend-compatibility", None)

    assert rejected_result["verdict"] == "FAIL"
    assert unknown_result["unknownPaths"] == ["unknown-root/main.py"]
    assert unknown_result["verdict"] == "FAIL"


def test_disposition_must_cover_exact_paths(tmp_path: Path) -> None:
    path = tmp_path / "disposition.json"
    path.write_text(
        json.dumps(
            {
                "candidateCommit": CANDIDATE,
                "changeId": "change-1",
                "crossBoundaryPaths": [],
                "reviewer": "reviewer",
                "decision": "ACCEPT",
                "rationale": "reviewed",
            }
        ),
        encoding="utf-8",
    )

    with pytest.raises(ChangeImpactError, match="exact cross-boundary"):
        validate_disposition(path, CANDIDATE, "change-1", ["contracts/proto/example.proto"])


def test_output_is_immutable(tmp_path: Path) -> None:
    output = tmp_path / "impact.json"
    write_immutable(output, {"verdict": "BLOCKED"})

    with pytest.raises(FileExistsError):
        write_immutable(output, {"verdict": "FAIL"})
