import json
from unittest.mock import MagicMock

import pytest
import yaml

from tests.test_operational_event_query_benchmark import BENCHMARKS, load_module


def owned_source() -> str:
    module = load_module("telemetry_prepared_plan")
    return (BENCHMARKS.parents[1] / module.SQL_SOURCE).read_text(encoding="utf-8")


def test_sql_prepare_preserves_owned_projection_scope_and_seven_parameter_positions() -> None:
    module = load_module("telemetry_prepared_plan")
    prepared, oracle = module.owned_prepared_queries(owned_source())
    assert "?" not in prepared and "%s" not in prepared
    assert all(f"${index}" in prepared for index in range(1, 8))
    assert "$8" not in prepared
    assert "c.ancestor_group_id = $5" in prepared
    assert "uuid > $6 ORDER BY uuid LIMIT $7" in prepared
    assert "group_id = ANY(%s)" in oracle and oracle.count("%s") == 3
    assert "organization_group_closure" not in oracle


@pytest.mark.parametrize(
    "before,after",
    [
        ("AND uuid > ?", "AND uuid >= ?"),
        ("ORDER BY uuid LIMIT ?", "ORDER BY uuid LIMIT ? OFFSET ?"),
        ("c.ancestor_group_id = ?", "TRUE"),
        ("c.descendant_group_id = telemetry_latest.group_id", "TRUE"),
    ],
)
def test_changed_owned_seek_or_scope_contract_is_rejected(before: str, after: str) -> None:
    module = load_module("telemetry_prepared_plan")
    with pytest.raises(module.QueryBenchmarkError):
        module.owned_prepared_queries(owned_source().replace(before, after))


@pytest.mark.parametrize("name", ["selectTelemetryBase", "andTelemetryAfterUuid", "orderTelemetryPage"])
def test_missing_owned_fragment_fails(name: str) -> None:
    module = load_module("telemetry_prepared_plan")
    with pytest.raises(module.QueryBenchmarkError):
        module.owned_prepared_queries(owned_source().replace("const val " + name, "const val removed_" + name))


@pytest.mark.parametrize("limit", [0, 502, True])
def test_fetch_boundary_is_not_unbounded(limit: int) -> None:
    module = load_module("telemetry_prepared_plan")
    with pytest.raises(module.QueryBenchmarkError):
        module.PlanCase("invalid", "sparse", "OPERATOR", ("sparse",), "", limit)


@pytest.mark.parametrize("limit", [1, 501])
def test_fetch_boundary_parameters_are_not_reordered(limit: int) -> None:
    module = load_module("telemetry_prepared_plan")
    case = module.PlanCase("valid", "sparse", "OPERATOR", ("sparse",), "position", limit)
    assert case.parameters == ("sparse", "OPERATOR", "ADMIN", "OPERATOR", "sparse", "position", limit)


@pytest.mark.parametrize(
    "mode,counts",
    [
        ("force_custom_plan", {"generic_plans": 0, "custom_plans": 10}),
        ("force_generic_plan", {"generic_plans": 10, "custom_plans": 0}),
        ("auto", {"generic_plans": 5, "custom_plans": 5}),
        ("auto", {"generic_plans": 0, "custom_plans": 10}),
    ],
)
def test_mode_is_proven_by_actual_server_counters(mode: str, counts: dict[str, int]) -> None:
    module = load_module("telemetry_prepared_plan")
    module.validate_mode_counts(module.PlanMode(mode), counts)


@pytest.mark.parametrize(
    "mode,counts",
    [
        ("auto", {"generic_plans": 0, "custom_plans": 0}),
        ("force_custom_plan", {"generic_plans": 1, "custom_plans": 9}),
        ("force_generic_plan", {"generic_plans": 9, "custom_plans": 1}),
    ],
)
def test_wrong_mode_does_not_masquerade_as_a_valid_measurement(mode: str, counts: dict[str, int]) -> None:
    module = load_module("telemetry_prepared_plan")
    with pytest.raises(module.QueryBenchmarkError, match="prepared_mode_not_exercised"):
        module.validate_mode_counts(module.PlanMode(mode), counts)


@pytest.mark.parametrize("row", [None, (-1, 0), (True, 1), ("private-query", 0)])
def test_invalid_server_counters_are_rejected(row: object) -> None:
    module = load_module("telemetry_prepared_plan")
    connection = MagicMock()
    connection.cursor.return_value.__enter__.return_value.fetchone.return_value = row
    with pytest.raises(module.QueryBenchmarkError):
        module.plan_counts(connection)


def test_same_wrong_oracle_rows_still_cannot_pass_scope_or_identity_validation(monkeypatch: pytest.MonkeyPatch) -> None:
    module = load_module("telemetry_prepared_plan")
    row = tuple([None, "synthetic", *([None] * 12), "dense", *([None] * 9)])
    monkeypatch.setattr(module, "read_rows", lambda *_: [row])
    case = module.PlanCase("sparse", "sparse", "OPERATOR", ("sparse",), "")
    with pytest.raises(module.QueryBenchmarkError, match="prepared_identity_or_scope_changed"):
        module.verify_result(MagicMock(), "oracle", case)
    monkeypatch.setattr(module, "read_rows", lambda *_: [row, row])
    case = module.PlanCase("dense", "dense", "OPERATOR", ("dense",), "")
    with pytest.raises(module.QueryBenchmarkError, match="prepared_identity_or_scope_changed"):
        module.verify_result(MagicMock(), "oracle", case)


def test_malformed_projection_is_rejected_before_indexing(monkeypatch: pytest.MonkeyPatch) -> None:
    module = load_module("telemetry_prepared_plan")
    monkeypatch.setattr(module, "read_rows", lambda *_: [("bad",)])
    case = module.PlanCase("sparse", "sparse", "OPERATOR", ("sparse",), "")
    with pytest.raises(module.QueryBenchmarkError, match="prepared_projection_changed"):
        module.verify_result(MagicMock(), "oracle", case)


def test_order_and_fetch_overflow_are_not_equivalent_results(monkeypatch: pytest.MonkeyPatch) -> None:
    module = load_module("telemetry_prepared_plan")
    first = tuple([None, "first", *([None] * 12), "dense", *([None] * 9)])
    second = tuple([None, "second", *([None] * 12), "dense", *([None] * 9)])
    case = module.PlanCase("dense", "dense", "OPERATOR", ("dense",), "")
    monkeypatch.setattr(module, "read_rows", MagicMock(side_effect=[[first, second], [second, first]]))
    with pytest.raises(module.QueryBenchmarkError, match="prepared_result_or_scope_changed"):
        module.verify_result(MagicMock(), "oracle", case)
    monkeypatch.setattr(module, "read_rows", lambda *_: [first, second])
    case = module.PlanCase("dense", "dense", "OPERATOR", ("dense",), "", 1)
    with pytest.raises(module.QueryBenchmarkError, match="prepared_result_or_scope_changed"):
        module.verify_result(MagicMock(), "oracle", case)


@pytest.mark.parametrize("value", [float("nan"), float("inf"), -1, True, "private-query", None])
def test_nonfinite_or_malformed_timing_is_not_summarized(value: object) -> None:
    module = load_module("telemetry_prepared_benchmark")
    with pytest.raises(module.QueryBenchmarkError, match="prepared_duration_invalid"):
        module.summarize([{"execution_ms": value, "planning_ms": 1}])


def test_empty_measurements_are_not_pass() -> None:
    module = load_module("telemetry_prepared_benchmark")
    with pytest.raises(module.QueryBenchmarkError):
        module.summarize([])


@pytest.mark.parametrize("row", [("other", None), ("gcs_query_benchmark", "existing"), None])
def test_fixture_refuses_wrong_database_and_overwrite_before_any_ddl(row: object) -> None:
    module = load_module("telemetry_prepared_benchmark")
    connection = MagicMock()
    cursor = connection.cursor.return_value.__enter__.return_value
    cursor.fetchone.return_value = row
    with pytest.raises(module.QueryBenchmarkError, match="prepared_fixture_must_be_new"):
        module.initialize_prepared_fixture(connection, module.BenchmarkOptions())
    assert cursor.execute.call_count == 1
    assert cursor.execute.call_args.args[0].startswith("SELECT")


def test_profiles_cover_skew_depth_hierarchy_empty_end_and_fetch_boundaries() -> None:
    module = load_module("telemetry_prepared_benchmark")
    cases = {case.name: case for case in module.benchmark_cases(100_000)}
    assert len(cases) == 12
    assert len(cases["wide_parent_front"].allowed_groups) == 32
    assert len(cases["narrow_parent_deep"].allowed_groups) == 3
    assert cases["sparse_deep"].position == "device-00075000"
    assert cases["empty_scope"].allowed_groups == ()
    assert cases["maximum_fetch"].fetch_limit == 501


def test_cli_does_not_connect_by_default_and_failure_closes_session_without_leaking(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    module = load_module("telemetry_prepared_benchmark")
    connect = MagicMock(side_effect=AssertionError("must not connect"))
    monkeypatch.setattr(module, "connect_fixture", connect)
    monkeypatch.setattr(module.sys, "argv", ["benchmark"])
    assert module.main() == 0
    assert json.loads(capsys.readouterr().out)["result"] == "NOT_RUN"
    connect.assert_not_called()
    connection = MagicMock()
    monkeypatch.setattr(module, "connect_fixture", lambda: connection)
    monkeypatch.setattr(
        module, "initialize_prepared_fixture", MagicMock(side_effect=module.psycopg2.Error("secret-sql"))
    )
    monkeypatch.setattr(module.sys, "argv", ["benchmark", "--run"])
    assert module.main() == 1
    connection.close.assert_called_once()
    assert json.loads(capsys.readouterr().out) == {
        "schema_version": module.SCHEMA_VERSION,
        "result": "FAIL",
        "error_code": "prepared_benchmark_failed",
    }


def test_ci_runs_prepared_plan_fixture_and_uploads_its_evidence() -> None:
    workflow = yaml.safe_load((BENCHMARKS.parents[1] / ".github/workflows/ci.yml").read_text(encoding="utf-8"))
    steps = workflow["jobs"]["backend-test"]["steps"]
    uploads = [step for step in steps if step.get("with", {}).get("name") == "telemetry-prepared-benchmark"]
    assert len(uploads) == 1 and uploads[0]["with"]["if-no-files-found"] == "error"
    assert any("telemetry_prepared_benchmark.py" in step.get("run", "") for step in steps)
