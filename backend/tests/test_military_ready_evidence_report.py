import runpy
from pathlib import Path
from typing import Any, Callable, cast

REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPT = REPO_ROOT / "scripts/reports/military_ready_evidence_report.py"
MODULE = runpy.run_path(str(SCRIPT))
build_report = cast(Callable[[str], dict[str, Any]], MODULE["build_report"])


def test_qualification_report_includes_failures_blockers_and_open_work() -> None:
    report = build_report("a" * 40)

    assert report["requirements"]["total"] == 10
    assert report["requirements"]["byStatus"]["BLOCKED"] >= 1
    assert report["hazards"] == {"total": 10, "byStatus": {"OPEN": 10}}
    assert report["stig"] == {"revision": "V6R4", "total": 286, "byStatus": {"NOT_RUN": 286}}
    assert report["poam"]["byStatus"]["OPEN"] >= 1
    assert report["claim"] == "assessment baseline only; not certified or conformant"


def test_qualification_report_binds_the_full_source_revision() -> None:
    revision = "0123456789abcdef0123456789abcdef01234567"

    assert build_report(revision)["sourceCommit"] == revision
