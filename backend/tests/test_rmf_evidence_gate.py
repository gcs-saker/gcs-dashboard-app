import runpy
from datetime import date
from typing import Any, Callable, cast

import pytest

MODULE = runpy.run_path("../scripts/gates/rmf_evidence_gate.py")
RmfEvidenceError = cast(type[BaseException], MODULE["RmfEvidenceError"])
validate = cast(Callable[[date], None], MODULE["validate"])
validate_poam = cast(Callable[[list[dict[str, Any]], set[str], date], None], MODULE["validate_poam"])


def test_repository_rmf_evidence_is_consistent() -> None:
    validate(date(2026, 9, 22))


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
