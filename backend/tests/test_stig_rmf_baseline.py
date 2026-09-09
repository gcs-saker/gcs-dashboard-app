import json
import runpy
from pathlib import Path

import yaml

REPO_ROOT = Path(__file__).resolve().parents[2]
SECURITY_ROOT = REPO_ROOT / "docs/compliance/security"
CHECKLIST = SECURITY_ROOT / "asd-stig-v6r4-checklist.json"
PROFILE = REPO_ROOT / "docs/compliance/software-military-ready-profile-v1.yml"
ASSESSMENT_GATE = REPO_ROOT / "scripts/gates/stig_assessment_gate.py"


def test_asd_stig_v6r4_import_is_complete_and_unassessed_by_default() -> None:
    checklist = json.loads(CHECKLIST.read_text(encoding="utf-8"))
    rules = checklist["rules"]

    assert checklist["revision"] == "V6R4"
    assert checklist["ruleCount"] == 286 == len(rules)
    assert len({rule["findingId"] for rule in rules}) == 286
    assert all(rule["findingId"].startswith("V-") for rule in rules)
    assert all(rule["status"] == "NOT_RUN" for rule in rules)
    assert all(rule["applicability"] == "PENDING_TAILORING" for rule in rules)
    assert len(checklist["sourceSha256"]) == 64


def test_profile_tracks_the_current_asd_stig_revision() -> None:
    profile = yaml.safe_load(PROFILE.read_text(encoding="utf-8"))
    standard = next(item for item in profile["standards"] if item["id"] == "DISA-ASD-STIG")

    assert standard["revision"] == "Version 6 Release 4"
    assert str(standard["documentDate"]) == "2025-09-09"


def test_stig_assessment_overlay_preserves_open_and_unassessed_work() -> None:
    counts = runpy.run_path(str(ASSESSMENT_GATE))["validate"]()

    assert counts == {
        "NOT_A_FINDING": 9,
        "NOT_APPLICABLE": 1,
        "OPEN": 276,
    }


def test_rmf_and_assessment_documents_track_implementation_and_open_findings() -> None:
    controls = yaml.safe_load((SECURITY_ROOT / "rmf-control-matrix.yml").read_text(encoding="utf-8"))["controls"]
    poam = yaml.safe_load((SECURITY_ROOT / "poam.yml").read_text(encoding="utf-8"))["items"]

    assert {
        "AC-2",
        "AC-3",
        "AC-12",
        "AU-2",
        "AU-3",
        "AU-5",
        "CA-2",
        "IA-2",
        "SC-2",
        "SC-8",
        "SC-13",
        "SI-2",
        "SA-11",
        "SA-15",
        "SR-4",
    } == {control["id"] for control in controls}
    assert all(control["implementation"] and control["assessment"] and control["evidence"] for control in controls)
    assert all(item["issue"] and item["mitigation"] and item["dueBy"] for item in poam)


def test_security_plan_set_declares_scope_verdicts_and_non_certification() -> None:
    ctp = (SECURITY_ROOT / "cybersecurity-test-plan.md").read_text(encoding="utf-8")
    ssp = (SECURITY_ROOT / "system-security-plan.md").read_text(encoding="utf-8")
    sar = (SECURITY_ROOT / "security-assessment-report.md").read_text(encoding="utf-8")

    assert all(status in ctp for status in ("PASS", "FAIL", "BLOCKED", "NOT_RUN", "NOT_APPLICABLE"))
    assert "Server-01 on SSH 55121 only" in ctp
    assert "Authorization boundary" in ssp
    assert "not an authorization decision or certification" in sar
