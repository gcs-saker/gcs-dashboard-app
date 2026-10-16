import importlib.util
import json
from pathlib import Path
from types import ModuleType
from xml.etree import ElementTree

import pytest
import yaml

SCRIPT = Path(__file__).resolve().parents[2] / "scripts/reports/geo_retention_index_evidence.py"


def module() -> ModuleType:
    spec = importlib.util.spec_from_file_location("geo_retention_index_evidence", SCRIPT)
    assert spec and spec.loader
    loaded = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(loaded)
    return loaded


def line() -> str:
    return "geo_retention_index result=PASS rows=100000 insert_rows=10000 baseline_sort_nodes=1 baseline_temp_written=10 baseline_plan_ms=20 candidate_index_used=1 candidate_sort_nodes=0 candidate_temp_written=0 index_bytes=100 candidate_plan_ms=2 build_ms=5 baseline_insert_ms=10 candidate_insert_ms=12 baseline_insert_wal=100 candidate_insert_wal=120"


def write_suite(directory: Path, evidence: ModuleType, status: str = "PASS") -> Path:
    root = ElementTree.Element(
        "testsuite",
        name=evidence.SUITE,
        tests="1",
        failures="1" if status == "FAIL" else "0",
        errors="0",
        skipped="1" if status == "BLOCKED" else "0",
    )
    case = ElementTree.SubElement(root, "testcase", name="candidate")
    if status != "PASS":
        ElementTree.SubElement(case, "failure" if status == "FAIL" else "skipped")
    ElementTree.SubElement(root, "system-out").text = "private-host private-token SELECT secret\n" + (
        line() if status != "BLOCKED" else ""
    )
    path = directory / ("TEST-" + evidence.SUITE + ".xml")
    ElementTree.ElementTree(root).write(path)
    return path


def test_report_exports_only_aggregate_candidate_costs(tmp_path: Path) -> None:
    evidence = module()
    write_suite(tmp_path, evidence)
    report = evidence.build_report(tmp_path, "a" * 40)
    assert report["result"] == "PASS" and len(report["measurements"]) == 1
    assert report["production_schema_change"] == "NOT_RUN"
    assert "private-" not in json.dumps(report) and "SELECT secret" not in json.dumps(report)


def test_schema_constants_are_immutable() -> None:
    evidence = module()
    with pytest.raises(TypeError):
        evidence.EXPECTED["rows"] = 0
    assert all(
        isinstance(getattr(evidence, name), frozenset) for name in ("FIELDS", "INTEGER_FIELDS", "DECIMAL_FIELDS")
    )


@pytest.mark.parametrize("status", ["FAIL", "BLOCKED"])
def test_failed_or_skipped_candidate_is_not_pass(tmp_path: Path, status: str) -> None:
    evidence = module()
    write_suite(tmp_path, evidence, status)
    assert evidence.build_report(tmp_path, "a" * 40)["result"] == status


@pytest.mark.parametrize(
    "change",
    [
        "rows=0",
        "insert_rows=0",
        "baseline_sort_nodes=0",
        "baseline_temp_written=0",
        "candidate_index_used=0",
        "candidate_sort_nodes=1",
        "candidate_temp_written=1",
        "index_bytes=0",
        "build_ms=3000",
        "baseline_plan_ms=0",
        "candidate_plan_ms=NaN",
        "baseline_insert_ms=-1",
        "candidate_insert_ms=NaN",
        "baseline_insert_wal=0",
        "candidate_insert_wal=0",
        "secret=token",
        "rows=100000 rows=100000",
    ],
)
def test_invalid_candidate_measurements_fail_closed(change: str) -> None:
    evidence = module()
    key = change.split("=", 1)[0]
    fields = [change if field.startswith(key + "=") else field for field in line().split()]
    if key == "secret":
        fields.append(change)
    with pytest.raises((evidence.GeoRetentionIndexEvidenceError, ValueError)):
        evidence.measurement(" ".join(fields))


@pytest.mark.parametrize("mutation", ["counts", "missing_case", "identity", "duplicate", "missing", "size", "dtd"])
def test_suite_integrity_and_single_measurement_are_required(tmp_path: Path, mutation: str) -> None:
    evidence = module()
    path = write_suite(tmp_path, evidence)
    root = ElementTree.parse(path).getroot()
    if mutation in {"counts", "identity"}:
        root.set("tests" if mutation == "counts" else "name", "2" if mutation == "counts" else "unowned")
    elif mutation == "missing_case":
        case = root.find("testcase")
        assert case is not None
        root.remove(case)
        root.set("tests", "0")
    else:
        stdout = root.find("system-out")
        assert stdout is not None
        stdout.text = "" if mutation == "missing" else (stdout.text or "") + "\n" + line()
    ElementTree.ElementTree(root).write(path)
    if mutation == "size":
        path.write_bytes(b" " * (evidence.MAX_XML_BYTES + 1))
    if mutation == "dtd":
        path.write_bytes(b"<!DOCTYPE testsuite []>" + path.read_bytes())
    with pytest.raises(evidence.GeoRetentionIndexEvidenceError):
        evidence.build_report(tmp_path, "a" * 40)


def test_missing_suite_and_moving_source_ref_are_rejected(tmp_path: Path) -> None:
    evidence = module()
    with pytest.raises(FileNotFoundError):
        evidence.build_report(tmp_path, "a" * 40)
    with pytest.raises(evidence.GeoRetentionIndexEvidenceError):
        evidence.build_report(tmp_path, "main")


def test_ci_extracts_candidate_evidence_and_production_schema_has_no_candidate() -> None:
    root = SCRIPT.parents[2]
    steps = yaml.safe_load((root / ".github/workflows/ci.yml").read_text())["jobs"]["auth-policy-test"]["steps"]
    testing = next(index for index, step in enumerate(steps) if step.get("name") == "Run auth-policy tests")
    extracting = [index for index, step in enumerate(steps) if "geo_retention_index_evidence.py" in step.get("run", "")]
    assert len(extracting) == 1 and extracting[0] > testing
    assert any(step.get("with", {}).get("name") == "geo-retention-index-evidence" for step in steps)
    tracked = "\n".join(
        path.read_text(errors="ignore")
        for path in [
            root / "deploy/postgres/init/001_geo_telemetry.sql",
            *sorted((root / "services/auth-policy/src/main/resources/db").rglob("*.sql")),
        ]
    )
    assert "idx_retention_fixture_points_time" not in tracked
