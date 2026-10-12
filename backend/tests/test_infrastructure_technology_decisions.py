from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[2]
DECISIONS = ROOT / "docs/architecture/server01-infrastructure-technology-decisions.yml"


def test_only_actionable_infrastructure_technologies_have_implementation_issues() -> None:
    document = yaml.safe_load(DECISIONS.read_text(encoding="utf-8"))

    assert document["schemaVersion"] == "gcs-saker.infrastructure-technology-decisions.v1"
    assert document["scope"] == "server01-production"
    for item in document["decisions"]:
        assert item["officialReference"].startswith("https://")
        if item["decision"] in {"ADOPT", "TRIAL"}:
            assert isinstance(item["implementationIssue"], int)
            assert item["implementationIssue"] > 0
        else:
            assert item["decision"] == "HOLD"
            assert item["implementationIssue"] is None
            assert item["reconsiderWhen"]


def test_adoption_order_starts_with_secret_and_health_risk() -> None:
    document = yaml.safe_load(DECISIONS.read_text(encoding="utf-8"))

    assert document["executionOrder"][0] == [881, 892, 882]
    actionable = {
        item["implementationIssue"] for item in document["decisions"] if item["decision"] in {"ADOPT", "TRIAL"}
    }
    ordered = {issue for stage in document["executionOrder"] for issue in stage}
    assert actionable <= ordered
