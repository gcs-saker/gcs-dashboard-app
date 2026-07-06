import json
import subprocess
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPT = REPO_ROOT / "scripts" / "benchmarks" / "m7_db_query_plan_contract.py"
GUIDE = REPO_ROOT / "docs" / "operations" / "GCS-Saker_DB_Query_Tuning_Guide_v0.1.md"


def test_m7_db_query_plan_contract_prints_stable_targets() -> None:
    result = subprocess.run(
        [sys.executable, str(SCRIPT), "--check"],
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    payload = json.loads(result.stdout)
    assert payload["schemaVersion"] == "m7-db-query-plan-contract-v1"
    target_names = {target["name"] for target in payload["targets"]}
    assert "operational_events_keyset_page" in target_names
    assert "operational_events_metrics" in target_names
    assert "operational_events_severity_counts" in target_names
    assert "telemetry_latest_lookup" in target_names
    for target in payload["targets"]:
        assert "EXPLAIN ANALYZE" in target["explainSql"]
        assert "SELECT *" not in target["explainSql"]


def test_db_query_tuning_guide_references_query_plan_contract_script() -> None:
    content = GUIDE.read_text(encoding="utf-8")

    assert "scripts/benchmarks/m7_db_query_plan_contract.py --check" in content
    assert "operational_events" in content
    assert "telemetry_latest" in content
