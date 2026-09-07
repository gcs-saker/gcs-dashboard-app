import runpy
from copy import deepcopy
from pathlib import Path
from typing import Any, Callable, cast

import pytest
import yaml

REPO_ROOT = Path(__file__).resolve().parents[2]
PROFILE = REPO_ROOT / "docs/compliance/software-military-ready-profile-v1.yml"
CATALOG = REPO_ROOT / "docs/compliance/requirements/software-military-ready-requirements.yml"
TRACE = REPO_ROOT / "docs/compliance/traceability/software-military-ready-traceability.yml"
SCRIPT = REPO_ROOT / "scripts/gates/military_ready_traceability_gate.py"
MODULE = runpy.run_path(str(SCRIPT))
TraceabilityError = cast(type[BaseException], MODULE["TraceabilityError"])
load_yaml = cast(Callable[[Path], dict[str, Any]], MODULE["load_yaml"])
validate_documents = cast(Callable[..., int], MODULE["validate_documents"])


def documents() -> tuple[dict[str, Any], dict[str, Any], dict[str, Any]]:
    return load_yaml(PROFILE), load_yaml(CATALOG), load_yaml(TRACE)


def test_traceability_gate_accepts_the_controlled_baseline() -> None:
    profile, catalog, trace = documents()

    assert validate_documents(profile, catalog, trace) == 10


def test_traceability_gate_rejects_an_orphan_requirement() -> None:
    profile, catalog, trace = documents()
    broken = deepcopy(trace)
    broken["traces"] = broken["traces"][:-1]

    with pytest.raises(TraceabilityError, match="IDs must match exactly"):
        validate_documents(profile, catalog, broken)


def test_traceability_gate_rejects_pass_without_complete_evidence() -> None:
    profile, catalog, trace = documents()
    broken_catalog = deepcopy(catalog)
    broken_trace = deepcopy(trace)
    broken_catalog["requirements"][0]["status"] = "PASS"
    broken_trace["traces"][0]["status"] = "PASS"

    with pytest.raises(TraceabilityError, match="PASS requires codeRefs"):
        validate_documents(profile, broken_catalog, broken_trace)


def test_traceability_gate_rejects_missing_local_references(tmp_path: Path) -> None:
    profile, catalog, trace = documents()

    with pytest.raises(TraceabilityError, match="missing local reference"):
        validate_documents(profile, catalog, trace, tmp_path)


def test_traceability_documents_are_yaml_serializable() -> None:
    assert all(yaml.safe_dump(document) for document in documents())
