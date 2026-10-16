import importlib.util
import json
from pathlib import Path
from types import ModuleType
from xml.etree import ElementTree

import pytest
import yaml

SCRIPT = Path(__file__).resolve().parents[2] / "scripts/reports/geo_schema_migration_evidence.py"


def module() -> ModuleType:
    spec = importlib.util.spec_from_file_location("geo_schema_migration_evidence", SCRIPT)
    assert spec and spec.loader
    loaded = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(loaded)
    return loaded


def write_suite(directory: Path, evidence: ModuleType, status: str = "PASS") -> Path:
    tests = 2 if status == "BLOCKED" else 5
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
    ElementTree.SubElement(root, "system-out").text = "private-host private-token private-path\n"
    path = directory / ("TEST-" + evidence.SUITE + ".xml")
    ElementTree.ElementTree(root).write(path)
    return path


def test_report_excludes_raw_logs_and_records_no_production_execution(tmp_path: Path) -> None:
    evidence = module()
    write_suite(tmp_path, evidence)
    report = evidence.build_report(tmp_path, "a" * 40)
    assert report["result"] == "PASS" and report["tests"]["tests"] == 5
    assert report["production_execution"] == "NOT_RUN" and report["backup_restore"] == "NOT_RUN"
    assert "private-" not in json.dumps(report)


@pytest.mark.parametrize("status", ["FAIL", "BLOCKED"])
def test_failure_and_missing_docker_are_not_pass(tmp_path: Path, status: str) -> None:
    evidence = module()
    write_suite(tmp_path, evidence, status)
    assert evidence.build_report(tmp_path, "a" * 40)["result"] == status


@pytest.mark.parametrize("mutation", ["count", "case", "identity", "dtd", "size"])
def test_suite_identity_and_real_case_counts_are_required(tmp_path: Path, mutation: str) -> None:
    evidence = module()
    path = write_suite(tmp_path, evidence)
    root = ElementTree.parse(path).getroot()
    if mutation in {"count", "identity"}:
        root.set("tests" if mutation == "count" else "name", "4" if mutation == "count" else "wrong")
    elif mutation == "case":
        case = root.find("testcase")
        assert case is not None
        root.remove(case)
        root.set("tests", "4")
    ElementTree.ElementTree(root).write(path)
    if mutation == "dtd":
        path.write_bytes(b"<!DOCTYPE testsuite []>" + path.read_bytes())
    if mutation == "size":
        path.write_bytes(b" " * (evidence.MAX_XML_BYTES + 1))
    with pytest.raises(evidence.GeoSchemaMigrationEvidenceError):
        evidence.build_report(tmp_path, "a" * 40)


@pytest.mark.parametrize("status", ["PASS", "FAIL", "BLOCKED", "NOT_RUN"])
def test_cli_exit_and_redaction(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str], status: str
) -> None:
    evidence = module()
    if status != "NOT_RUN":
        write_suite(tmp_path, evidence, status)
    monkeypatch.setattr("sys.argv", [str(SCRIPT), "--results-dir", str(tmp_path), "--source-commit", "a" * 40])
    assert evidence.main() == (0 if status == "PASS" else 1)
    output = json.loads(capsys.readouterr().out)
    assert output["result"] == status and "private-" not in json.dumps(output)


def test_missing_suite_and_moving_source_are_rejected(tmp_path: Path) -> None:
    evidence = module()
    with pytest.raises(FileNotFoundError):
        evidence.build_report(tmp_path, "a" * 40)
    with pytest.raises(evidence.GeoSchemaMigrationEvidenceError):
        evidence.build_report(tmp_path, "main")


def test_ci_extracts_evidence_after_auth_policy_tests() -> None:
    steps = yaml.safe_load((SCRIPT.parents[2] / ".github/workflows/ci.yml").read_text())["jobs"]["auth-policy-test"][
        "steps"
    ]
    testing = next(index for index, step in enumerate(steps) if step.get("name") == "Run auth-policy tests")
    extracting = [
        index for index, step in enumerate(steps) if "geo_schema_migration_evidence.py" in step.get("run", "")
    ]
    assert len(extracting) == 1 and extracting[0] > testing
    assert any(step.get("with", {}).get("name") == "geo-schema-migration-evidence" for step in steps)
