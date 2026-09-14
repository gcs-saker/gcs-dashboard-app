import runpy
from pathlib import Path
from typing import Any, Callable, cast

import pytest

ROOT = Path(__file__).resolve().parents[2]
MODULE = runpy.run_path(str(ROOT / "scripts/reports/software_quality_measurement.py"))
QualityMeasurementError = cast(type[BaseException], MODULE["QualityMeasurementError"])
load_yaml = cast(Callable[[Path], dict[str, Any]], MODULE["load_yaml"])
validate_catalogues = cast(Callable[[], None], MODULE["validate_catalogues"])
collect_junit = cast(Callable[[list[Path]], tuple[dict[str, str], list[dict[str, str]]]], MODULE["collect_junit"])
collect_verification = cast(
    Callable[[list[Path], str | None], tuple[dict[str, str], list[dict[str, str]]]],
    MODULE["collect_verification"],
)
measure_functional = cast(Callable[[dict[str, str]], dict[str, Any]], MODULE["measure_functional"])
measure_authorization = cast(Callable[[dict[str, str]], dict[str, Any]], MODULE["measure_authorization"])
AUTHORIZATION_PATH = ROOT / "docs/compliance/security/authorization-denial-matrix.yml"


def write_junit(path: Path, cases: list[tuple[str, str, str]]) -> None:
    bodies = []
    for class_name, name, status in cases:
        child = "<failure/>" if status == "FAIL" else "<skipped/>" if status == "SKIPPED" else ""
        bodies.append(f'<testcase classname="{class_name}" name="{name}">{child}</testcase>')
    path.write_text(f"<testsuite>{''.join(bodies)}</testsuite>", encoding="utf-8")


def test_catalogues_are_complete_and_references_exist() -> None:
    validate_catalogues()


def test_junit_collection_hashes_evidence_and_normalizes_gradle_names(tmp_path: Path) -> None:
    report = tmp_path / "TEST-policy.xml"
    write_junit(report, [("example.StreamPolicyControllerTest", "missing token is rejected()", "PASS")])

    results, artifacts = collect_junit([report])

    assert results == {"StreamPolicyControllerTest::missing token is rejected": "PASS"}
    assert len(artifacts[0]["sha256"]) == 64


def test_failed_duplicate_result_cannot_be_hidden_by_pass(tmp_path: Path) -> None:
    first = tmp_path / "first.xml"
    second = tmp_path / "second.xml"
    selector = ("example.StreamPolicyControllerTest", "viewer cannot send talkback in same group", "PASS")
    write_junit(first, [selector])
    write_junit(second, [(selector[0], selector[1], "FAIL")])

    results, _ = collect_junit([first, second])

    assert results["StreamPolicyControllerTest::viewer cannot send talkback in same group"] == "FAIL"


def test_non_junit_evidence_requires_current_source_commit(tmp_path: Path) -> None:
    report = tmp_path / "runtime.json"
    report.write_text(
        '{"schemaVersion":"gcs-saker.verification-results.v1","sourceCommit":"stale","results":[]}',
        encoding="utf-8",
    )

    with pytest.raises(QualityMeasurementError, match="commit mismatch"):
        collect_verification([report], "current")


def test_functional_measure_never_counts_file_presence_as_pass() -> None:
    result = measure_functional({})

    assert result["verifiedCount"] == 0
    assert result["ratio"] == 0
    assert result["verdict"] == "BLOCKED"


def test_functional_failure_produces_fail_verdict() -> None:
    result = measure_functional({"AuthSessionServiceTest::login rejects unknown user or invalid password": "FAIL"})

    assert result["failedIds"] == ["PTR-AUTH-LOGIN"]
    assert result["verdict"] == "FAIL"


def test_authorization_measure_reports_unexecuted_cases() -> None:
    result = measure_authorization({})

    assert result["attemptedCount"] == 0
    assert result["correctlyDeniedRatio"] == 0
    assert result["verdict"] == "NOT_RUN"


def test_authorization_failure_is_not_reported_as_denial() -> None:
    selector = "StreamPolicyControllerTest::viewer cannot send talkback in same group"
    result = measure_authorization({selector: "FAIL"})

    assert result["correctlyDeniedCount"] == 0
    assert result["unexpectedPermitOrFailureIds"] == ["AD-TALKBACK-002"]
    assert result["verdict"] == "FAIL"


def test_all_authorization_denials_remain_blocked_until_threshold_approval() -> None:
    matrix = load_yaml(AUTHORIZATION_PATH)
    results = {case["selector"]: "PASS" for case in matrix["cases"]}

    result = measure_authorization(results)

    assert result["attemptedCount"] == result["totalCases"]
    assert result["correctlyDeniedRatio"] == 1.0
    assert result["verdict"] == "BLOCKED"


def test_junit_without_identity_is_rejected(tmp_path: Path) -> None:
    report = tmp_path / "invalid.xml"
    report.write_text("<testsuite><testcase/></testsuite>", encoding="utf-8")

    with pytest.raises(QualityMeasurementError, match="classname and name"):
        collect_junit([report])
