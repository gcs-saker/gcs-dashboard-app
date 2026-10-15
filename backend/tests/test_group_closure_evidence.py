import importlib.util
import json
import sys
from pathlib import Path
from types import ModuleType
from xml.etree import ElementTree

import pytest

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts/reports/group_closure_evidence.py"


def module() -> ModuleType:
    spec = importlib.util.spec_from_file_location("group_closure_evidence", SCRIPT)
    assert spec and spec.loader
    loaded = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = loaded
    spec.loader.exec_module(loaded)
    return loaded


def write_suites(directory: Path, evidence: ModuleType, skipped: int = 0, failures: int = 0) -> None:
    for name in evidence.SUITES:
        root = ElementTree.Element(
            "testsuite", name=name, tests="10", skipped=str(skipped), failures=str(failures), errors="0"
        )
        stdout = ElementTree.SubElement(root, "system-out")
        stdout.text = "private-host private-secret private-identity\n"
        if "Benchmark" in name:
            stdout.text += "group_closure_benchmark result=PASS variant=legacy groups=1007 closure_rows=3017 row_mutations=6034 samples=9 p50_ms=20 p95_ms=30\n"
            stdout.text += "group_closure_benchmark result=PASS variant=delta groups=1007 closure_rows=3017 row_mutations=12 samples=9 p50_ms=2 p95_ms=3\n"
        ElementTree.ElementTree(root).write(directory / ("TEST-" + name + ".xml"))


def test_evidence_contains_only_owned_counts_and_measurements(tmp_path: Path) -> None:
    evidence = module()
    write_suites(tmp_path, evidence)
    report = evidence.build_report(tmp_path, "a" * 40)
    assert report["result"] == "PASS"
    assert len(report["measurements"]) == 2
    assert "private-" not in json.dumps(report)
    assert report["physical_media_qualification"] == "NOT_RUN"


@pytest.mark.parametrize("skipped,failures,status", [(1, 0, "BLOCKED"), (0, 1, "FAIL"), (1, 1, "FAIL")])
def test_skipped_or_failed_tests_never_become_pass(tmp_path: Path, skipped: int, failures: int, status: str) -> None:
    evidence = module()
    write_suites(tmp_path, evidence, skipped, failures)
    assert evidence.build_report(tmp_path, "a" * 40)["result"] == status


@pytest.mark.parametrize("revision", ["main", "a" * 39, "z" * 40])
def test_source_identity_is_an_immutable_revision(tmp_path: Path, revision: str) -> None:
    evidence = module()
    with pytest.raises(evidence.GroupClosureEvidenceError):
        evidence.build_report(tmp_path, revision)


@pytest.mark.parametrize(
    "line",
    [
        "group_closure_benchmark result=PASS variant=delta groups=1 closure_rows=1 row_mutations=0 samples=9 p50_ms=NaN p95_ms=10",
        "group_closure_benchmark result=PASS variant=delta groups=1 closure_rows=1 row_mutations=0 samples=9 p50_ms=1 p95_ms=0",
        "group_closure_benchmark result=PASS variant=delta groups=1 closure_rows=1 row_mutations=0 samples=9 p50_ms=1 p95_ms=2 password=private",
    ],
)
def test_incompatible_or_sensitive_measurement_fields_are_rejected(line: str) -> None:
    evidence = module()
    with pytest.raises(evidence.GroupClosureEvidenceError):
        evidence.measurement(line)


def test_production_closure_dao_has_no_whole_table_delete_or_truncate() -> None:
    source = (
        ROOT
        / "services/auth-policy/src/main/kotlin/kr/co/a4ai/gcssaker/authpolicy/infrastructure/persistence/groups/JdbcGroupClosureDao.kt"
    ).read_text()
    assert "TRUNCATE" not in source
    assert "DELETE FROM organization_group_closure WHERE" in source
    assert '"DELETE FROM organization_group_closure"' not in source
