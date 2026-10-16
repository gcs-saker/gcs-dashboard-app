import importlib.util
import json
from pathlib import Path
from types import ModuleType
from xml.etree import ElementTree

import pytest
import yaml

SCRIPT = Path(__file__).resolve().parents[2] / "scripts/reports/telemetry_own_scope_evidence.py"


def module() -> ModuleType:
    spec = importlib.util.spec_from_file_location("telemetry_own_scope_evidence", SCRIPT)
    assert spec and spec.loader
    loaded = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(loaded)
    return loaded


def write_suites(directory: Path, evidence: ModuleType, skipped: int = 0, failures: int = 0) -> None:
    for name in evidence.SUITES:
        root = ElementTree.Element(
            "testsuite", name=name, tests="4", skipped=str(skipped), failures=str(failures), errors="0"
        )
        stdout = ElementTree.SubElement(root, "system-out")
        stdout.text = "private-host private-identity private-token\n"
        if name.endswith("TelemetryOwnGroupJdbcPostgresTest"):
            for mode in evidence.MODES:
                for case in evidence.CASES:
                    stdout.text += f"telemetry_own_jdbc result=PASS mode={mode} case={case} pgjdbc=42.7.12 rows=100001 samples=9 legacy_p50_ms=1 bounded_p50_ms=1 legacy_p95_ms=2 bounded_p95_ms=2\n"
        ElementTree.ElementTree(root).write(directory / ("TEST-" + name + ".xml"))


def test_owned_evidence_excludes_raw_logs_sql_and_identifiers(tmp_path: Path) -> None:
    evidence = module()
    write_suites(tmp_path, evidence)
    report = evidence.build_report(tmp_path, "a" * 40)
    assert report["result"] == "PASS" and len(report["measurements"]) == 9
    assert "private-" not in json.dumps(report)
    assert report["production_deployment"] == "NOT_RUN"


@pytest.mark.parametrize("skipped,failures,result", [(1, 0, "BLOCKED"), (0, 1, "FAIL"), (1, 1, "FAIL")])
def test_incomplete_suites_are_never_pass(tmp_path: Path, skipped: int, failures: int, result: str) -> None:
    evidence = module()
    write_suites(tmp_path, evidence, skipped, failures)
    assert evidence.build_report(tmp_path, "a" * 40)["result"] == result


@pytest.mark.parametrize(
    "change",
    ["unknown=private-secret", "legacy_p50_ms=NaN", "rows=0", "samples=2", "pgjdbc=private-host", "case=unknown"],
)
def test_bad_or_extra_measurement_fields_are_rejected(change: str) -> None:
    evidence = module()
    fields = "result=PASS mode=auto case=dense pgjdbc=42.7.12 rows=100001 samples=9 legacy_p50_ms=1 bounded_p50_ms=1 legacy_p95_ms=2 bounded_p95_ms=2"
    if change.startswith("unknown="):
        fields += " " + change
    else:
        key = change.split("=", 1)[0]
        fields = " ".join(change if field.startswith(key + "=") else field for field in fields.split())
    with pytest.raises(evidence.TelemetryOwnEvidenceError):
        evidence.measurement("telemetry_own_jdbc " + fields)


def test_missing_duplicate_or_wrong_identity_reports_fail_closed(tmp_path: Path) -> None:
    evidence = module()
    with pytest.raises(FileNotFoundError):
        evidence.build_report(tmp_path, "a" * 40)
    write_suites(tmp_path, evidence)
    path = tmp_path / ("TEST-" + evidence.SUITES[1] + ".xml")
    root = ElementTree.parse(path).getroot()
    stdout = root.find("system-out")
    assert stdout is not None
    stdout.text = (stdout.text or "") + root.findtext("system-out", "").splitlines()[-1] + "\n"
    ElementTree.ElementTree(root).write(path)
    with pytest.raises(evidence.TelemetryOwnEvidenceError):
        evidence.build_report(tmp_path, "a" * 40)
    root.set("name", "wrong-suite")
    ElementTree.ElementTree(root).write(path)
    with pytest.raises(evidence.TelemetryOwnEvidenceError):
        evidence.build_report(tmp_path, "a" * 40)


def test_invalid_source_revision_does_not_link_evidence_to_a_moving_ref(tmp_path: Path) -> None:
    evidence = module()
    with pytest.raises(evidence.TelemetryOwnEvidenceError):
        evidence.build_report(tmp_path, "main")


def test_ci_extracts_evidence_only_after_real_auth_policy_tests() -> None:
    root = Path(__file__).resolve().parents[2]
    workflow = yaml.safe_load((root / ".github/workflows/ci.yml").read_text())
    steps = workflow["jobs"]["auth-policy-test"]["steps"]
    runs = [index for index, step in enumerate(steps) if "telemetry_own_scope_evidence.py" in step.get("run", "")]
    tests = next(index for index, step in enumerate(steps) if step.get("name") == "Run auth-policy tests")
    assert len(runs) == 1 and runs[0] > tests
    assert any(step.get("with", {}).get("name") == "telemetry-own-jdbc-evidence" for step in steps)
