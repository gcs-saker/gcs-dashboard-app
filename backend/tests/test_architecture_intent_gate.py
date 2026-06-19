from __future__ import annotations

from pathlib import Path
import json
import subprocess
import sys

import yaml


REPO_ROOT = Path(__file__).resolve().parents[2]
INTENT_MATRIX = REPO_ROOT / "docs" / "architecture" / "GCS-Saker_design_intent_matrix.yml"
SCRIPT = REPO_ROOT / "scripts" / "architecture_intent_gate.py"
PR_TEMPLATE = REPO_ROOT / ".github" / "pull_request_template.md"


def load_yaml(path: Path) -> dict:
    with path.open("r", encoding="utf-8") as file:
        return yaml.safe_load(file)


def test_architecture_intent_gate_passes_and_reports_checked_assertions() -> None:
    result = subprocess.run(
        [sys.executable, str(SCRIPT), "--json"],
        check=False,
        capture_output=True,
        text=True,
        cwd=REPO_ROOT,
    )

    assert result.returncode == 0, result.stderr
    payload = json.loads(result.stdout)
    assert payload["schemaVersion"] == "architecture-intent-gate-v1"
    assert payload["checkedIntents"] >= 8
    assert payload["checkedAssertions"] >= 60


def test_design_intent_matrix_covers_core_architecture_categories() -> None:
    matrix = load_yaml(INTENT_MATRIX)
    intents = matrix["intents"]
    categories = {intent["category"] for intent in intents}

    assert matrix["schemaVersion"] == "gcs-saker-design-intent-matrix-v1"
    assert {
        "runtime",
        "edge-routing",
        "protocol-boundary",
        "media-pipeline",
        "security",
        "observability",
        "performance",
    } <= categories


def test_design_intent_matrix_has_issue_traceability_and_evidence() -> None:
    matrix = load_yaml(INTENT_MATRIX)

    for intent in matrix["intents"]:
        assert intent["id"].startswith("ARCH-")
        assert isinstance(intent["issue"], int)
        assert intent["linkedStacks"], f"{intent['id']} must link runtime stack entries"
        assert intent["rationale"], f"{intent['id']} must explain why it exists"
        assert intent["assertions"].get("evidencePaths"), f"{intent['id']} must list evidence paths"


def test_pull_request_template_requires_design_intent_review() -> None:
    template = PR_TEMPLATE.read_text(encoding="utf-8")
    normalized_template = template.lower()

    assert "Design Intent" in template
    assert "architecture intent gate" in normalized_template
    assert "active/profile/contract/prototype/deferred" in template
