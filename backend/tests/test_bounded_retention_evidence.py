import importlib.util
import json
from pathlib import Path
from types import ModuleType
from xml.etree import ElementTree

import pytest
import yaml

SCRIPT = Path(__file__).resolve().parents[2] / "scripts/reports/bounded_retention_evidence.py"


def module() -> ModuleType:
    spec = importlib.util.spec_from_file_location("bounded_retention_evidence", SCRIPT)
    assert spec and spec.loader
    loaded = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(loaded)
    return loaded


def lines() -> str:
    return "\n".join(
        [
            "bounded_retention result=PASS profile=complete batches=3 history_deleted=2501 points_deleted=2501 exit_code=0",
            "bounded_retention result=PASS profile=resume batches=4 history_deleted=2501 points_deleted=2501 exit_code=0",
            "bounded_retention result=PASS profile=locked_recovery batches=4 history_deleted=1 points_deleted=1 exit_code=0",
        ]
    )


def write_suite(directory: Path, evidence: ModuleType, status: str = "PASS") -> Path:
    tests = 2 if status == "BLOCKED" else 4
    root = ElementTree.Element(
        "testsuite",
        name=evidence.SUITE,
        tests=str(tests),
        failures="1" if status == "FAIL" else "0",
        errors="0",
        skipped=str(tests) if status == "BLOCKED" else "0",
    )
    for index in range(tests):
        case = ElementTree.SubElement(root, "testcase", name=f"test-{index}")
        if status == "BLOCKED" or status == "FAIL" and index == 0:
            ElementTree.SubElement(case, "skipped" if status == "BLOCKED" else "failure")
    ElementTree.SubElement(root, "system-out").text = "private-host private-token\n" + (
        "" if status == "BLOCKED" else lines()
    )
    path = directory / ("TEST-" + evidence.SUITE + ".xml")
    ElementTree.ElementTree(root).write(path)
    return path


def test_report_exports_only_aggregate_profiles_and_not_runtime_claim(tmp_path: Path) -> None:
    evidence = module()
    write_suite(tmp_path, evidence)
    report = evidence.build_report(tmp_path, "a" * 40)
    assert report["result"] == "PASS" and len(report["measurements"]) == 3
    assert report["runtime_scheduler_connected"] == "NO" and report["production_execution"] == "NOT_RUN"
    assert "private-" not in json.dumps(report)


@pytest.mark.parametrize("status", ["FAIL", "BLOCKED"])
def test_failure_and_missing_docker_are_not_pass(tmp_path: Path, status: str) -> None:
    evidence = module()
    write_suite(tmp_path, evidence, status)
    assert evidence.build_report(tmp_path, "a" * 40)["result"] == status


@pytest.mark.parametrize(
    "change",
    [
        "profile=unknown",
        "batches=0",
        "history_deleted=0",
        "points_deleted=0",
        "exit_code=75",
        "result=FAIL",
        "secret=token",
        "batches=3 batches=3",
    ],
)
def test_bad_or_private_measurement_fields_fail_closed(tmp_path: Path, change: str) -> None:
    evidence = module()
    path = write_suite(tmp_path, evidence)
    root = ElementTree.parse(path).getroot()
    stdout = root.find("system-out")
    assert stdout is not None
    rows = (stdout.text or "").splitlines()
    key = change.split("=", 1)[0]
    fields = [change if field.startswith(key + "=") else field for field in rows[1].split()]
    if key == "secret":
        fields.append(change)
    rows[1] = " ".join(fields)
    stdout.text = "\n".join(rows)
    ElementTree.ElementTree(root).write(path)
    with pytest.raises((evidence.BoundedRetentionEvidenceError, ValueError)):
        evidence.build_report(tmp_path, "a" * 40)


@pytest.mark.parametrize("mutation", ["count", "case", "identity", "duplicate", "missing", "dtd", "size"])
def test_suite_and_complete_profile_set_are_required(tmp_path: Path, mutation: str) -> None:
    evidence = module()
    path = write_suite(tmp_path, evidence)
    root = ElementTree.parse(path).getroot()
    if mutation in {"count", "identity"}:
        root.set("tests" if mutation == "count" else "name", "3" if mutation == "count" else "wrong")
    elif mutation == "case":
        case = root.find("testcase")
        assert case is not None
        root.remove(case)
        root.set("tests", "3")
    else:
        stdout = root.find("system-out")
        assert stdout is not None
        stdout.text = "" if mutation == "missing" else (stdout.text or "") + "\n" + lines().splitlines()[0]
    ElementTree.ElementTree(root).write(path)
    if mutation == "dtd":
        path.write_bytes(b"<!DOCTYPE testsuite []>" + path.read_bytes())
    if mutation == "size":
        path.write_bytes(b" " * (evidence.MAX_XML_BYTES + 1))
    with pytest.raises(evidence.BoundedRetentionEvidenceError):
        evidence.build_report(tmp_path, "a" * 40)


def test_ci_extracts_evidence_and_runtime_maintenance_remains_unconnected() -> None:
    root = SCRIPT.parents[2]
    steps = yaml.safe_load((root / ".github/workflows/ci.yml").read_text())["jobs"]["auth-policy-test"]["steps"]
    testing = next(index for index, step in enumerate(steps) if step.get("name") == "Run auth-policy tests")
    extracting = [index for index, step in enumerate(steps) if "bounded_retention_evidence.py" in step.get("run", "")]
    assert len(extracting) == 1 and extracting[0] > testing
    assert any(step.get("with", {}).get("name") == "bounded-retention-evidence" for step in steps)
    maintenance = (root / "scripts/ops/runtime_maintenance.sh").read_text()
    assert "run_bounded_telemetry_retention.sh" not in maintenance
