import runpy
from copy import deepcopy
from pathlib import Path
from typing import Any, Callable, cast

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPT = REPO_ROOT / "scripts/gates/iso_assurance_gate.py"
MODULE = runpy.run_path(str(SCRIPT))
IsoAssuranceError = cast(type[BaseException], MODULE["IsoAssuranceError"])
load_yaml = cast(Callable[[Path], dict[str, Any]], MODULE["load_yaml"])
validate_architecture = cast(Callable[[dict[str, Any]], None], MODULE["validate_architecture"])
validate_quality = cast(Callable[[dict[str, Any]], None], MODULE["validate_quality"])
ARCHITECTURE = REPO_ROOT / "docs/compliance/architecture/iso-42010-architecture-description.yml"
QUALITY = REPO_ROOT / "docs/compliance/quality/software-quality-evaluation-profile.yml"


def test_iso_assurance_gate_accepts_controlled_drafts() -> None:
    validate_architecture(load_yaml(ARCHITECTURE))
    validate_quality(load_yaml(QUALITY))


def test_architecture_claim_stays_unassessed_without_review() -> None:
    document = deepcopy(load_yaml(ARCHITECTURE))
    document["conformance"]["claim"] = "PASS"

    with pytest.raises(IsoAssuranceError, match="must remain NOT_ASSESSED"):
        validate_architecture(document)


def test_quality_gate_rejects_missing_characteristic() -> None:
    document = deepcopy(load_yaml(QUALITY))
    document["qualityCharacteristics"].remove("safety")

    with pytest.raises(IsoAssuranceError, match="characteristics are incomplete"):
        validate_quality(document)


def test_quality_gate_rejects_approved_threshold_without_assessment() -> None:
    document = deepcopy(load_yaml(QUALITY))
    document["thresholdPolicy"]["status"] = "APPROVED"

    with pytest.raises(IsoAssuranceError, match="must remain proposed"):
        validate_quality(document)
