import importlib.util
import json
from pathlib import Path
from types import ModuleType
from xml.etree import ElementTree

import pytest
import yaml

SCRIPT = Path(__file__).resolve().parents[2] / "scripts/reports/telemetry_mixed_evidence.py"


def module() -> ModuleType:
    spec = importlib.util.spec_from_file_location("telemetry_mixed_evidence", SCRIPT)
    assert spec and spec.loader
    loaded = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(loaded)
    return loaded


def line(profile: str = "small_page", operation: str = "read") -> str:
    page_size = {"small_page": 1, "max_page": 500}[profile]
    return f"telemetry_mixed result=PASS profile={profile} operation={operation} page_size={page_size} workers=4 samples=64 rows=100001 history_added=64 calls=64 shared_hits=1 shared_reads=0 temp_written=0 p50_ms=1 p95_ms=2 exec_ms=3 wal_bytes=4"


def write_suite(directory: Path, evidence: ModuleType, status: str = "PASS") -> Path:
    # Disabled parameterized factories can have two skipped methods instead of four resolved cases.
    tests = 2 if status == "BLOCKED" else 4
    counts = {
        "failures": "1" if status == "FAIL" else "0",
        "errors": "0",
        "skipped": str(tests) if status == "BLOCKED" else "0",
    }
    root = ElementTree.Element("testsuite", {"name": evidence.SUITE, "tests": str(tests), **counts})
    for index in range(tests):
        case = ElementTree.SubElement(root, "testcase", name=f"test-{index}")
        if status == "BLOCKED" or status == "FAIL" and index == 0:
            ElementTree.SubElement(case, "skipped" if status == "BLOCKED" else "failure")
    ElementTree.SubElement(root, "system-out").text = (
        "private-token private-uuid private-host SELECT secret\n"
        + "\n".join(line(profile, operation) for profile in evidence.PROFILES for operation in evidence.OPERATIONS)
    )
    path = directory / ("TEST-" + evidence.SUITE + ".xml")
    ElementTree.ElementTree(root).write(path)
    return path


def test_only_aggregate_mixed_load_evidence_is_exported(tmp_path: Path) -> None:
    evidence = module()
    write_suite(tmp_path, evidence)
    report = evidence.build_report(tmp_path, "a" * 40)
    assert report["result"] == "PASS" and len(report["measurements"]) == 4
    assert "private-" not in json.dumps(report) and "SELECT secret" not in json.dumps(report)
    assert report["physical_mobile"] == "BLOCKED" and report["media_e2e"] == "NOT_RUN"


@pytest.mark.parametrize("status", ["BLOCKED", "FAIL"])
def test_skipped_factories_and_failed_cases_are_not_pass(tmp_path: Path, status: str) -> None:
    evidence = module()
    write_suite(tmp_path, evidence, status)
    assert evidence.build_report(tmp_path, "a" * 40)["result"] == status


def test_disabled_parameterized_factories_without_any_measurement_are_blocked(tmp_path: Path) -> None:
    evidence = module()
    path = write_suite(tmp_path, evidence, "BLOCKED")
    root = ElementTree.parse(path).getroot()
    stdout = root.find("system-out")
    assert stdout is not None
    stdout.text = ""
    ElementTree.ElementTree(root).write(path)
    report = evidence.build_report(tmp_path, "a" * 40)
    assert report["result"] == "BLOCKED" and report["measurements"] == []


@pytest.mark.parametrize(
    "change",
    [
        "calls=63",
        "samples=0",
        "workers=100",
        "rows=0",
        "history_added=63",
        "wal_bytes=NaN",
        "exec_ms=-1",
        "p95_ms=0",
        "temp_written=1",
        "page_size=501",
        "profile=unknown",
        "operation=unknown",
        "private=token",
        "calls=64 calls=64",
    ],
)
def test_measurements_reject_bad_bounds_profiles_duplicates_and_secrets(change: str) -> None:
    evidence = module()
    key = change.split("=", 1)[0]
    fields = [change if field.startswith(key + "=") else field for field in line().split()]
    if key == "private":
        fields.append(change)
    with pytest.raises((evidence.TelemetryMixedEvidenceError, ValueError)):
        evidence.measurement(" ".join(fields))


@pytest.mark.parametrize("mutation", ["counts", "identity", "duplicate", "missing", "dtd", "size", "case_missing"])
def test_suite_integrity_and_complete_profile_matrix_are_required(tmp_path: Path, mutation: str) -> None:
    evidence = module()
    path = write_suite(tmp_path, evidence)
    root = ElementTree.parse(path).getroot()
    if mutation in {"counts", "identity"}:
        root.set("tests" if mutation == "counts" else "name", "99" if mutation == "counts" else "unowned")
    elif mutation == "case_missing":
        root.remove(root.findall("testcase")[0])
        root.set("tests", "3")
    else:
        stdout = root.find("system-out")
        assert stdout is not None
        stdout.text = line() if mutation == "missing" else (stdout.text or "") + "\n" + line()
    ElementTree.ElementTree(root).write(path)
    if mutation == "dtd":
        path.write_bytes(b"<!DOCTYPE testsuite []>" + path.read_bytes())
    if mutation == "size":
        path.write_bytes(b" " * (evidence.MAX_XML_BYTES + 1))
    with pytest.raises(evidence.TelemetryMixedEvidenceError):
        evidence.build_report(tmp_path, "a" * 40)


def test_missing_suite_and_moving_ref_are_rejected(tmp_path: Path) -> None:
    evidence = module()
    with pytest.raises(FileNotFoundError):
        evidence.build_report(tmp_path, "a" * 40)
    with pytest.raises(evidence.TelemetryMixedEvidenceError):
        evidence.build_report(tmp_path, "main")


@pytest.mark.parametrize("status", ["PASS", "FAIL", "BLOCKED", "NOT_RUN"])
def test_cli_exit_status_and_redaction(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str], status: str
) -> None:
    evidence = module()
    if status != "NOT_RUN":
        write_suite(tmp_path, evidence, status)
    monkeypatch.setattr("sys.argv", [str(SCRIPT), "--results-dir", str(tmp_path), "--source-commit", "a" * 40])
    assert evidence.main() == (0 if status == "PASS" else 1)
    output = json.loads(capsys.readouterr().out)
    assert output["result"] == status and "private-" not in json.dumps(output)


def test_ci_extracts_evidence_after_real_tests() -> None:
    workflow = yaml.safe_load((SCRIPT.parents[2] / ".github/workflows/ci.yml").read_text())
    steps = workflow["jobs"]["auth-policy-test"]["steps"]
    testing = next(index for index, step in enumerate(steps) if step.get("name") == "Run auth-policy tests")
    extracting = [index for index, step in enumerate(steps) if "telemetry_mixed_evidence.py" in step.get("run", "")]
    assert len(extracting) == 1 and extracting[0] > testing
    assert any(step.get("with", {}).get("name") == "telemetry-mixed-evidence" for step in steps)
