import importlib.util
import json
from pathlib import Path
from types import ModuleType
from xml.etree import ElementTree

import pytest
import yaml

SCRIPT = Path(__file__).resolve().parents[2] / "scripts/reports/telemetry_writer_evidence.py"


def module() -> ModuleType:
    spec = importlib.util.spec_from_file_location("telemetry_writer_evidence", SCRIPT)
    assert spec and spec.loader
    loaded = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(loaded)
    return loaded


def line(case: str = "distinct_identities") -> str:
    history, latest = {"distinct_identities": (64, 64), "same_identity": (64, 1), "duplicate_event": (1, 1)}[case]
    return f"telemetry_writer result=PASS case={case} workers=4 samples=64 history={history} latest={latest} calls=64 shared_hits=1 shared_reads=0 temp_written=0 p50_ms=1 p95_ms=2 exec_ms=3 wal_bytes=4"


def write_suite(directory: Path, evidence: ModuleType, status: str = "PASS") -> Path:
    counts = {"failures": "0", "errors": "0", "skipped": "0"}
    tag = {"BLOCKED": "skipped", "FAIL": "failure"}.get(status)
    if tag:
        counts["failures" if tag == "failure" else tag] = "1"
    root = ElementTree.Element("testsuite", {"name": evidence.SUITE, "tests": "5", **counts})
    for index in range(5):
        case = ElementTree.SubElement(root, "testcase", name=f"test-{index}")
        if index == 0 and tag:
            ElementTree.SubElement(case, tag)
    ElementTree.SubElement(root, "system-out").text = (
        "private-host private-token private-uuid SELECT secret\n"
        + "\n".join(line(case) for case in evidence.EXPECTED_COUNTS)
    )
    path = directory / ("TEST-" + evidence.SUITE + ".xml")
    ElementTree.ElementTree(root).write(path)
    return path


def test_only_owned_aggregate_measurements_are_exported(tmp_path: Path) -> None:
    evidence = module()
    write_suite(tmp_path, evidence)
    report = evidence.build_report(tmp_path, "a" * 40)
    assert report["result"] == "PASS" and len(report["measurements"]) == 3
    assert "private-" not in json.dumps(report) and "SELECT secret" not in json.dumps(report)
    assert report["production_deployment"] == "NOT_RUN" and report["physical_mobile"] == "BLOCKED"


@pytest.mark.parametrize("status", ["BLOCKED", "FAIL"])
def test_skipped_and_failed_tests_are_not_pass(tmp_path: Path, status: str) -> None:
    evidence = module()
    write_suite(tmp_path, evidence, status)
    assert evidence.build_report(tmp_path, "a" * 40)["result"] == status


@pytest.mark.parametrize(
    "change",
    [
        "calls=63",
        "samples=0",
        "workers=100",
        "history=1",
        "wal_bytes=NaN",
        "exec_ms=-1",
        "p95_ms=0",
        "temp_written=1",
        "case=unknown",
        "private=token",
        "calls=64 calls=64",
    ],
)
def test_measurements_fail_closed_on_bad_bounds_and_secrets(change: str) -> None:
    evidence = module()
    key = change.split("=", 1)[0]
    fields = line().split()
    fields = [change if field.startswith(key + "=") else field for field in fields]
    if key == "private":
        fields.append(change)
    with pytest.raises((evidence.TelemetryWriterEvidenceError, ValueError)):
        evidence.measurement(" ".join(fields))


@pytest.mark.parametrize("mutation", ["counts", "identity", "duplicate", "missing", "dtd", "size"])
def test_suite_integrity_is_checked(tmp_path: Path, mutation: str) -> None:
    evidence = module()
    path = write_suite(tmp_path, evidence)
    root = ElementTree.parse(path).getroot()
    if mutation in {"counts", "identity"}:
        root.set("tests" if mutation == "counts" else "name", "99" if mutation == "counts" else "unowned")
    else:
        stdout = root.find("system-out")
        assert stdout is not None
        stdout.text = line() if mutation == "missing" else (stdout.text or "") + "\n" + line()
    ElementTree.ElementTree(root).write(path)
    if mutation == "dtd":
        path.write_bytes(b"<!DOCTYPE testsuite []>" + path.read_bytes())
    if mutation == "size":
        path.write_bytes(b" " * (evidence.MAX_XML_BYTES + 1))
    with pytest.raises(evidence.TelemetryWriterEvidenceError):
        evidence.build_report(tmp_path, "a" * 40)


def test_missing_suite_and_moving_source_are_not_accepted(tmp_path: Path) -> None:
    evidence = module()
    with pytest.raises(FileNotFoundError):
        evidence.build_report(tmp_path, "a" * 40)
    with pytest.raises(evidence.TelemetryWriterEvidenceError):
        evidence.build_report(tmp_path, "main")


def test_ci_extracts_writer_evidence_after_real_tests() -> None:
    workflow = yaml.safe_load((SCRIPT.parents[2] / ".github/workflows/ci.yml").read_text())
    steps = workflow["jobs"]["auth-policy-test"]["steps"]
    testing = next(index for index, step in enumerate(steps) if step.get("name") == "Run auth-policy tests")
    extracting = [index for index, step in enumerate(steps) if "telemetry_writer_evidence.py" in step.get("run", "")]
    assert len(extracting) == 1 and extracting[0] > testing
    assert any(step.get("with", {}).get("name") == "telemetry-writer-evidence" for step in steps)
