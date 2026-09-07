from datetime import date
from pathlib import Path
from typing import Any

import yaml

REPO_ROOT = Path(__file__).resolve().parents[2]
PROFILE = REPO_ROOT / "docs" / "compliance" / "software-military-ready-profile-v1.yml"
GUIDE = REPO_ROOT / "docs" / "compliance" / "GCS-Saker_Software_Military_Ready_Profile_v1.0.md"
VALID_STATUSES = {"PASS", "FAIL", "BLOCKED", "NOT_RUN", "NOT_APPLICABLE", "PLANNED_HARDWARE"}
REQUIRED_STANDARDS = {
    "MIL-STD-1472H",
    "MIL-STD-2525E-C1",
    "MIL-STD-882E-C1",
    "NIST-SP-800-218",
    "DISA-ASD-STIG",
    "NIST-SP-800-53-REV5",
    "ISO-IEC-IEEE-12207",
    "MIL-STD-810H",
    "MIL-STD-461G",
}


def load_profile() -> dict[str, Any]:
    return yaml.safe_load(PROFILE.read_text(encoding="utf-8"))


def test_military_ready_profile_has_required_standards_and_status_contract() -> None:
    profile = load_profile()
    standards = profile["standards"]

    assert PROFILE.exists() and GUIDE.exists()
    assert set(profile["statusVocabulary"]) == VALID_STATUSES
    assert {standard["id"] for standard in standards} == REQUIRED_STANDARDS
    assert all(standard["clauseScope"] for standard in standards)
    assert all(standard["requirementIds"] for standard in standards)
    assert all(standard["owner"] and standard["verification"] for standard in standards)
    assert all(standard["status"] in VALID_STATUSES for standard in standards)


def test_unqualified_claims_and_hardware_standards_fail_closed() -> None:
    profile = load_profile()
    standards = {standard["id"]: standard for standard in profile["standards"]}
    claim_policy = profile["claimPolicy"]

    assert claim_policy["certified"]["currentUse"] == "prohibited"
    assert claim_policy["conformant"]["currentUse"] == "prohibited"
    assert standards["MIL-STD-810H"]["status"] == "PLANNED_HARDWARE"
    assert standards["MIL-STD-461G"]["status"] == "PLANNED_HARDWARE"
    assert profile["nonApplicableFamilies"] == [
        {
            "id": "MIL-STD-188-FAMILY",
            "applicability": "NOT_APPLICABLE",
            "rationale": "No named radio, modem, or SATCOM interoperability profile is currently part of the product boundary.",
            "activationTrigger": "a specific external tactical communications interface and exact MIL-STD-188 sheet are selected",
        }
    ]


def test_profile_review_is_time_bounded_and_uses_authoritative_sources() -> None:
    profile = load_profile()
    verified_at = date.fromisoformat(str(profile["verifiedAt"]))
    next_review = date.fromisoformat(str(profile["nextReviewBy"]))

    assert (next_review - verified_at).days <= profile["reviewPolicy"]["cadenceDays"] + 2
    assert all(str(standard["source"]).startswith("https://") for standard in profile["standards"])
    assert (
        "verify status and revision against the authoritative publisher" in profile["reviewPolicy"]["requiredActions"]
    )
