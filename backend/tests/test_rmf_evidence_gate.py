import runpy
from datetime import date
from typing import Any, Callable, cast

import pytest

MODULE = runpy.run_path("../scripts/gates/rmf_evidence_gate.py")
RmfEvidenceError = cast(type[BaseException], MODULE["RmfEvidenceError"])
validate = cast(Callable[[date], None], MODULE["validate"])
validate_poam = cast(Callable[[list[dict[str, Any]], set[str], date], None], MODULE["validate_poam"])


def test_repository_rmf_evidence_is_consistent() -> None:
    validate(date(2026, 11, 2))


def test_overdue_open_poam_item_fails_closed() -> None:
    item = {
        "id": "POAM-TEST-001",
        "controls": ["AC-2"],
        "issue": "https://github.com/example/project/issues/1",
        "mitigation": "bounded mitigation",
        "dueBy": "2026-01-01",
        "status": "OPEN",
    }

    with pytest.raises(RmfEvidenceError, match="overdue"):
        validate_poam([item], {"AC-2"}, date(2026, 9, 22))


def test_poam_extension_requires_review_reason_and_forward_date() -> None:
    item = {
        "id": "POAM-TEST-002",
        "controls": ["AC-2"],
        "issue": "https://github.com/example/project/issues/2",
        "mitigation": "bounded mitigation",
        "dueBy": "2026-12-01",
        "extendedFrom": "2026-12-01",
        "reviewedAt": "2026-11-02",
        "extensionReason": "External dependency remains unresolved.",
        "status": "OPEN",
    }

    with pytest.raises(RmfEvidenceError, match="does not move"):
        validate_poam([item], {"AC-2"}, date(2026, 11, 2))


def test_poam_extension_requires_a_review_reason() -> None:
    item = {
        "id": "POAM-TEST-004",
        "controls": ["AC-2"],
        "issue": "https://github.com/example/project/issues/4",
        "mitigation": "bounded mitigation",
        "dueBy": "2026-12-01",
        "extendedFrom": "2026-10-31",
        "reviewedAt": "2026-11-02",
        "extensionReason": "",
        "status": "OPEN",
    }

    with pytest.raises(RmfEvidenceError, match="review is incomplete"):
        validate_poam([item], {"AC-2"}, date(2026, 11, 2))


def test_poam_extension_accepts_owned_future_schedule() -> None:
    item = {
        "id": "POAM-TEST-003",
        "controls": ["AC-2"],
        "issue": "https://github.com/example/project/issues/3",
        "mitigation": "bounded mitigation",
        "dueBy": "2026-12-01",
        "extendedFrom": "2026-10-31",
        "reviewedAt": "2026-11-02",
        "extensionReason": "External assessor scheduling is owned by the linked issue.",
        "status": "OPEN",
    }

    validate_poam([item], {"AC-2"}, date(2026, 11, 2))
