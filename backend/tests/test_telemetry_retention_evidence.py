import importlib.util
import json
from pathlib import Path
from types import ModuleType
from xml.etree import ElementTree

import pytest
import yaml

SCRIPT = Path(__file__).resolve().parents[2] / "scripts/reports/telemetry_retention_evidence.py"


def module() -> ModuleType:
    spec = importlib.util.spec_from_file_location("telemetry_retention_evidence", SCRIPT)
    assert spec and spec.loader
    loaded = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(loaded)
    return loaded


def line() -> str:
    return "telemetry_retention result=PASS rows=100000 samples=9 batch_size=1000 history_deleted=9000 points_deleted=9000 history_remaining=91001 points_remaining=91000 calls=9 shared_hits=1 shared_reads=0 temp_written=0 p50_ms=1 p95_ms=2 exec_ms=3 wal_bytes=4 history_index_used=1 history_temp_written=0 points_sort_nodes=1 points_temp_written=10"


def write_suite(directory: Path, evidence: ModuleType, status: str = "PASS") -> Path:
    tests = 10 if status == "BLOCKED" else 19
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
    ElementTree.SubElement(root, "system-out").text = "private-uuid private-host private-token SELECT secret\n" + (
        "" if status == "BLOCKED" else line()
    )
    path = directory / ("TEST-" + evidence.SUITE + ".xml")
    ElementTree.ElementTree(root).write(path)
    return path


def test_only_owned_aggregate_evidence_is_exported_and_legacy_is_not_claimed_fixed(tmp_path: Path) -> None:
    evidence = module()
    write_suite(tmp_path, evidence)
    report = evidence.build_report(tmp_path, "a" * 40)
    assert report["result"] == "PASS" and len(report["measurements"]) == 1
    assert report["legacy_scheduler"] == "UNCHANGED_UNBOUNDED"
    assert report["performance_qualification"] == "FAIL"
    assert "private-" not in json.dumps(report) and "SELECT secret" not in json.dumps(report)
    assert report["media_e2e"] == "NOT_RUN" and report["physical_mobile"] == "BLOCKED"


def test_schema_and_profile_definitions_are_immutable() -> None:
    evidence = module()
    with pytest.raises(TypeError):
        evidence.EXPECTED["rows"] = 0
    assert all(
        isinstance(getattr(evidence, name), frozenset) for name in ("FIELDS", "INTEGER_FIELDS", "DECIMAL_FIELDS")
    )


@pytest.mark.parametrize("status", ["FAIL", "BLOCKED"])
def test_failures_and_disabled_parameterized_factories_are_not_pass(tmp_path: Path, status: str) -> None:
    evidence = module()
    write_suite(tmp_path, evidence, status)
    assert evidence.build_report(tmp_path, "a" * 40)["result"] == status


@pytest.mark.parametrize(
    "change",
    [
        "rows=0",
        "samples=0",
        "batch_size=1001",
        "history_deleted=9001",
        "points_deleted=9001",
        "history_remaining=0",
        "points_remaining=0",
        "calls=8",
        "shared_reads=-1",
        "wal_bytes=NaN",
        "p95_ms=0",
        "p95_ms=3000",
        "p50_ms=-1",
        "exec_ms=inf",
        "secret=token",
        "calls=9 calls=9",
    ],
)
def test_measurement_boundaries_duplicates_and_private_fields_fail_closed(change: str) -> None:
    evidence = module()
    key = change.split("=", 1)[0]
    fields = [change if field.startswith(key + "=") else field for field in line().split()]
    if key == "secret":
        fields.append(change)
    with pytest.raises((evidence.TelemetryRetentionEvidenceError, ValueError)):
        evidence.measurement(" ".join(fields))


@pytest.mark.parametrize("mutation", ["counts", "case_missing", "identity", "duplicate", "missing", "size", "dtd"])
def test_junit_identity_counts_and_single_measurement_are_required(tmp_path: Path, mutation: str) -> None:
    evidence = module()
    path = write_suite(tmp_path, evidence)
    root = ElementTree.parse(path).getroot()
    if mutation in {"counts", "identity"}:
        root.set("tests" if mutation == "counts" else "name", "99" if mutation == "counts" else "unowned")
    elif mutation == "case_missing":
        root.remove(root.findall("testcase")[0])
        root.set("tests", "18")
    else:
        stdout = root.find("system-out")
        assert stdout is not None
        stdout.text = "" if mutation == "missing" else (stdout.text or "") + "\n" + line()
    ElementTree.ElementTree(root).write(path)
    if mutation == "size":
        path.write_bytes(b" " * (evidence.MAX_XML_BYTES + 1))
    if mutation == "dtd":
        path.write_bytes(b"<!DOCTYPE testsuite []>" + path.read_bytes())
    with pytest.raises(evidence.TelemetryRetentionEvidenceError):
        evidence.build_report(tmp_path, "a" * 40)


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


def test_missing_suite_and_moving_source_ref_are_rejected(tmp_path: Path) -> None:
    evidence = module()
    with pytest.raises(FileNotFoundError):
        evidence.build_report(tmp_path, "a" * 40)
    with pytest.raises(evidence.TelemetryRetentionEvidenceError):
        evidence.build_report(tmp_path, "main")


def test_ci_evidence_and_additive_private_migration_preserve_legacy_consumer() -> None:
    root = SCRIPT.parents[2]
    steps = yaml.safe_load((root / ".github/workflows/ci.yml").read_text())["jobs"]["auth-policy-test"]["steps"]
    testing = next(index for index, step in enumerate(steps) if step.get("name") == "Run auth-policy tests")
    extracting = [index for index, step in enumerate(steps) if "telemetry_retention_evidence.py" in step.get("run", "")]
    assert len(extracting) == 1 and extracting[0] > testing
    assert any(step.get("with", {}).get("name") == "telemetry-retention-evidence" for step in steps)
    migration = (
        root / "services/auth-policy/src/main/resources/db/postgresql-migration/V38__bounded_telemetry_retention.sql"
    ).read_text()
    maintenance = (root / "scripts/ops/runtime_maintenance.sh").read_text()
    assert migration.count("FOR UPDATE SKIP LOCKED") == 2
    assert "max_batch_size CONSTANT INTEGER := 1000" in migration and "REVOKE ALL" in migration
    assert "NOT isfinite(as_of_at)" in migration and "bounded retention timeouts required" in migration
    assert "SET LOCAL lock_timeout = '2s'" in migration and "SET LOCAL statement_timeout = '10s'" in migration
    assert "prune_telemetry_history_batch" not in maintenance
    assert "CREATE OR REPLACE" not in migration and "DROP " not in migration
    compose = yaml.safe_load((root / "deploy/compose/compose.single-node.poc.yml").read_text())
    kotlin = (
        root / "services/auth-policy/src/test/kotlin/kr/co/a4ai/gcssaker/authpolicy/TelemetryRetentionPostgresTest.kt"
    ).read_text()
    assert compose["services"]["postgres-geo"]["image"] in kotlin
