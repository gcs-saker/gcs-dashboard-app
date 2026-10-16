import json
from unittest.mock import MagicMock

import pytest
import yaml

from tests.test_operational_event_query_benchmark import BENCHMARKS, load_module


def source_text() -> str:
    module = load_module("telemetry_keyset_benchmark")
    return (BENCHMARKS.parents[1] / module.SQL_SOURCE).read_text(encoding="utf-8")


def test_candidate_keeps_projection_parameters_oracle_and_disjoint_scopes() -> None:
    module = load_module("telemetry_scoped_candidate")
    prepared = load_module("telemetry_prepared_plan")
    candidate, oracle = module.candidate_queries(source_text())
    _, owned_oracle = prepared.owned_prepared_queries(source_text())
    assert oracle == owned_oracle
    assert candidate.count("UNION ALL") == 2
    assert "JOIN LATERAL" in candidate
    assert "($2 = $3) IS NOT TRUE" in candidate
    assert "(c.descendant_group_id = $1) IS NOT TRUE" in candidate
    assert "AND (group_id = $1) IS NOT TRUE" not in candidate
    assert "c.ancestor_group_id = $5" in candidate
    assert candidate.count("ORDER BY uuid LIMIT $7") == 4
    assert "$8" not in candidate and "?" not in candidate
    assert candidate.count("SELECT event_id, uuid,") == 3


@pytest.mark.parametrize(
    "before,after",
    [
        ("group_id = ? OR", "group_id <> ? OR"),
        ("SELECT 1 FROM organization_group_closure c", "SELECT 2 FROM organization_group_closure c"),
        ("AND uuid > ?", "AND uuid >= ?"),
        ("ORDER BY uuid LIMIT ?", "ORDER BY uuid LIMIT ? OFFSET ?"),
        ("(? = 'GROUP_ADMIN' AND EXISTS", "(? <> 'GROUP_ADMIN' AND EXISTS"),
    ],
)
def test_changed_scope_seek_or_hierarchy_contract_fails_closed(before: str, after: str) -> None:
    module = load_module("telemetry_scoped_candidate")
    with pytest.raises(module.QueryBenchmarkError):
        module.candidate_queries(source_text().replace(before, after))


@pytest.mark.parametrize("name", ["selectTelemetryBase", "andTelemetryAfterUuid", "orderTelemetryPage"])
def test_missing_owned_fragments_fail(name: str) -> None:
    module = load_module("telemetry_scoped_candidate")
    with pytest.raises(module.QueryBenchmarkError):
        module.candidate_queries(source_text().replace("const val " + name, "const val missing_" + name))


def test_candidate_reads_hierarchy_role_from_owned_literal_not_a_separate_enum_copy() -> None:
    module = load_module("telemetry_scoped_candidate")
    candidate, _ = module.candidate_queries(source_text().replace("'GROUP_ADMIN'", "'OWNED_HIERARCHY_ROLE'"))
    assert "$4 = 'OWNED_HIERARCHY_ROLE'" in candidate
    assert "'GROUP_ADMIN'" not in candidate


def test_null_and_incompatible_sql_parameter_edges_are_explicit_not_api_cases() -> None:
    module = load_module("telemetry_scoped_benchmark")
    edges = module.sql_boundary_parameters()
    assert len(edges) == 6 and all(len(parameters) == 7 for parameters in edges)
    assert any(parameters[1] is None and parameters[2] is None for parameters in edges)
    assert any(parameters[1] != parameters[3] for parameters in edges)
    assert all(parameters[-1] == 51 for parameters in edges)


def test_boundary_result_drift_is_not_pass(monkeypatch: pytest.MonkeyPatch) -> None:
    module = load_module("telemetry_scoped_benchmark")
    monkeypatch.setattr(module, "boundary_results", MagicMock(side_effect=[[["first"]], [["different"]]]))
    with pytest.raises(module.QueryBenchmarkError, match="scoped_sql_boundary_results_changed"):
        module.verify_boundaries(
            MagicMock(), {"current": ("current", "oracle"), "scoped_union": ("candidate", "oracle")}
        )


def test_scope_change_probe_verifies_before_and_after_on_same_prepared_statement(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    module = load_module("telemetry_scoped_benchmark")
    connection = MagicMock()
    cursor = connection.cursor.return_value.__enter__.return_value
    cursor.rowcount = 1
    verifier = MagicMock()
    monkeypatch.setattr(module, "verify_result", verifier)
    assert module.verify_live_scope(connection, {"current": ("statement", "oracle")}, 100000)
    before = verifier.call_args_list[0].args[-1]
    after = verifier.call_args_list[1].args[-1]
    assert "child-0" in before.allowed_groups and "child-0" not in after.allowed_groups
    statements = [call.args[0] for call in cursor.execute.call_args_list]
    assert statements.count("statement") == 1
    assert any(statement.startswith("DELETE") for statement in statements)
    assert any(statement.startswith("INSERT") for statement in statements)
    assert statements[-1].startswith("DEALLOCATE")


def test_scope_probe_refuses_claim_without_expected_fixture_change(monkeypatch: pytest.MonkeyPatch) -> None:
    module = load_module("telemetry_scoped_benchmark")
    connection = MagicMock()
    connection.cursor.return_value.__enter__.return_value.rowcount = 0
    monkeypatch.setattr(module, "verify_result", MagicMock())
    with pytest.raises(module.QueryBenchmarkError, match="scoped_fixture_reparent_failed"):
        module.verify_live_scope(connection, {"current": ("statement", "oracle")}, 100000)


def test_variant_order_rotates_and_every_mode_uses_same_case_contract(monkeypatch: pytest.MonkeyPatch) -> None:
    module = load_module("telemetry_scoped_benchmark")
    runner = MagicMock(return_value={"results_equal": True})
    monkeypatch.setattr(module, "run_mode", runner)
    variants = {"current": ("current", "oracle"), "scoped_union": ("candidate", "oracle")}
    report = module.compare_modes(MagicMock(), variants, module.BenchmarkOptions())
    assert list(report) == ["current", "scoped_union"]
    assert [call.args[1][0] for call in runner.call_args_list] == [
        "current",
        "candidate",
        "candidate",
        "current",
        "current",
        "candidate",
    ]
    assert all(len(call.args[2]) == 12 for call in runner.call_args_list)


def test_cli_default_no_connection_and_boundary_failure_closes_session(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    module = load_module("telemetry_scoped_benchmark")
    connect = MagicMock(side_effect=AssertionError("must not connect"))
    monkeypatch.setattr(module, "connect_fixture", connect)
    monkeypatch.setattr(module.sys, "argv", ["benchmark"])
    assert module.main() == 0
    assert json.loads(capsys.readouterr().out)["result"] == "NOT_RUN"
    connect.assert_not_called()
    connection = MagicMock()
    monkeypatch.setattr(module, "connect_fixture", lambda: connection)
    monkeypatch.setattr(module, "initialize_prepared_fixture", MagicMock(return_value={}))
    monkeypatch.setattr(module, "compare_modes", MagicMock(return_value={}))
    monkeypatch.setattr(module, "verify_boundaries", MagicMock(side_effect=module.QueryBenchmarkError("private-query")))
    monkeypatch.setattr(module.sys, "argv", ["benchmark", "--run"])
    assert module.main() == 1
    connection.close.assert_called_once()
    assert json.loads(capsys.readouterr().out) == {
        "schema_version": module.SCHEMA_VERSION,
        "result": "FAIL",
        "error_code": "scoped_benchmark_failed",
    }


def test_ci_uses_a_separate_disposable_database_for_no_overwrite_contract() -> None:
    workflow = yaml.safe_load((BENCHMARKS.parents[1] / ".github/workflows/ci.yml").read_text(encoding="utf-8"))
    steps = workflow["jobs"]["backend-test"]["steps"]
    runs = [step for step in steps if "telemetry_scoped_benchmark.py" in step.get("run", "")]
    assert len(runs) == 1
    assert runs[0]["env"]["GCS_QUERY_BENCHMARK_PORT"] == "15434"
    assert "scoped-query-benchmark" in runs[0]["run"]
    assert "pg_isready -q -h 127.0.0.1" in runs[0]["run"]
    uploads = [step for step in steps if step.get("with", {}).get("name") == "telemetry-scoped-candidate"]
    assert len(uploads) == 1 and uploads[0]["with"]["if-no-files-found"] == "error"
