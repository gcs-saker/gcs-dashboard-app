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
validate_architecture_views = cast(Callable[[dict[str, Any]], None], MODULE["validate_architecture_views"])
validate_quality = cast(Callable[[dict[str, Any]], None], MODULE["validate_quality"])
validate_evaluation_plan = cast(Callable[[dict[str, Any], dict[str, Any]], None], MODULE["validate_evaluation_plan"])
ARCHITECTURE = REPO_ROOT / "docs/compliance/architecture/iso-42010-architecture-description.yml"
ARCHITECTURE_VIEWS = REPO_ROOT / "docs/compliance/architecture/system-architecture-views.yml"
QUALITY = REPO_ROOT / "docs/compliance/quality/software-quality-evaluation-profile.yml"
EVALUATION_PLAN = REPO_ROOT / "docs/compliance/quality/software-quality-evaluation-plan.yml"


def test_iso_assurance_gate_accepts_controlled_drafts() -> None:
    validate_architecture(load_yaml(ARCHITECTURE))
    validate_architecture_views(load_yaml(ARCHITECTURE_VIEWS))
    quality = load_yaml(QUALITY)
    validate_quality(quality)
    validate_evaluation_plan(load_yaml(EVALUATION_PLAN), quality)


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


def test_architecture_views_reject_unknown_interface_owner() -> None:
    document = deepcopy(load_yaml(ARCHITECTURE_VIEWS))
    document["interfaces"][0]["owner"] = "CMP-UNKNOWN"

    with pytest.raises(IsoAssuranceError, match="unknown owner"):
        validate_architecture_views(document)


def test_architecture_views_reject_unknown_flow_transport() -> None:
    document = deepcopy(load_yaml(ARCHITECTURE_VIEWS))
    document["operationalFlows"][2]["transportAlternatives"].append("IF-UNKNOWN")

    with pytest.raises(IsoAssuranceError, match="unknown transport"):
        validate_architecture_views(document)


def test_evaluation_plan_rejects_missing_measure_procedure() -> None:
    document = deepcopy(load_yaml(EVALUATION_PLAN))
    document["procedures"].pop()

    with pytest.raises(IsoAssuranceError, match="exactly one procedure"):
        validate_evaluation_plan(document, load_yaml(QUALITY))


def test_evaluation_plan_rejects_premature_acceptance_authority() -> None:
    document = deepcopy(load_yaml(EVALUATION_PLAN))
    document["roles"]["acceptanceAuthority"] = "product-owner"

    with pytest.raises(IsoAssuranceError, match="cannot be self-approved"):
        validate_evaluation_plan(document, load_yaml(QUALITY))
