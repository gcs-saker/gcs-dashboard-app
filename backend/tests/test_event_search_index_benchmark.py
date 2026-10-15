import json
from unittest.mock import MagicMock

import pytest
import yaml

from tests.test_operational_event_query_benchmark import BENCHMARKS, load_module


def owned_source() -> str:
    plans = load_module("event_query_plan")
    return (BENCHMARKS.parents[1] / plans.SQL_SOURCE).read_text(encoding="utf-8")


def test_search_reuses_every_owned_expression_scope_order_and_bound() -> None:
    module = load_module("event_search_index_benchmark")
    query, oracle = module.owned_search_sql(owned_source())
    assert query.count("%s") == 15
    assert oracle.count("%s") == 11
    assert "c.ancestor_group_id = %s" in query
    assert "ORDER BY occurred_at DESC, id DESC" in query
    assert query.rstrip().endswith("LIMIT %s")
    assert "OFFSET" not in query


@pytest.mark.parametrize("name", ["andTextQuery", "selectBase", "orderByOccurredAt", "limit"])
def test_missing_owned_contract_is_fail_closed(name: str) -> None:
    module = load_module("event_search_index_benchmark")
    with pytest.raises(module.QueryBenchmarkError):
        module.owned_search_sql(owned_source().replace("const val " + name, "const val removed_" + name))


@pytest.mark.parametrize(
    "old,new",
    [
        ("LOWER(source) LIKE ?", "source LIKE ?"),
        ("LIKE ?", "ILIKE ?"),
        ("c.descendant_group_id = operational_events.group_id", "TRUE"),
    ],
)
def test_drifted_index_or_scope_expression_is_not_benchmarked_as_owned(old: str, new: str) -> None:
    module = load_module("event_search_index_benchmark")
    with pytest.raises(module.QueryBenchmarkError):
        module.owned_search_sql(owned_source().replace(old, new))


@pytest.mark.parametrize("role,count", [("OPERATOR", 1), ("GROUP_ADMIN", 2), ("ADMIN", 3)])
def test_fixture_scope_oracle_and_parameter_count(role: str, count: int) -> None:
    module = load_module("event_search_index_benchmark")
    case = module.SearchCase("rare", "  NeEdLeAlpha  ", role)
    assert len(case.groups) == count
    assert case.parameters[:5] == ("co-a", role, "ADMIN", role, "co-a")
    assert case.parameters[5:14] == ("%needlealpha%",) * 9
    assert case.parameters[-1] == 51


def test_profiles_include_short_unicode_wildcards_null_field_and_group_boundaries() -> None:
    module = load_module("event_search_index_benchmark")
    cases = {case.name for case in module.SEARCH_CASES}
    assert {
        "one_character",
        "two_characters",
        "korean_short",
        "korean_long",
        "wildcard_percent",
        "wildcard_underscore",
        "nullable_field",
        "descendant_scope",
        "global_scope",
        "missing",
    } <= cases


@pytest.mark.parametrize("row", [("other_database", False), ("gcs_query_benchmark", True), None])
def test_fixture_refuses_existing_namespace_or_wrong_database_before_any_write(row: object) -> None:
    fixture = load_module("event_search_fixture")
    connection = MagicMock()
    cursor = connection.cursor.return_value.__enter__.return_value
    cursor.fetchone.return_value = row
    with pytest.raises(fixture.QueryBenchmarkError, match="search_fixture_must_be_new"):
        fixture.initialize_profiles(connection, fixture.BenchmarkOptions())
    assert cursor.execute.call_count == 1
    assert cursor.execute.call_args.args[0].startswith("SELECT")


def test_index_variants_and_expressions_are_fixed_not_cli_identifiers() -> None:
    fixture = load_module("event_search_fixture")
    assert len(fixture.SEARCH_EXPRESSIONS) == 9
    assert [variant.value for variant in fixture.SearchIndexVariant] == ["baseline", "gin_pending", "gin_direct"]
    with pytest.raises(ValueError):
        fixture.SearchIndexVariant("public; DROP DATABASE anything")


@pytest.mark.parametrize("group,rows", [("co-b", 1), ("co-a", 52)])
def test_same_wrong_results_cannot_bypass_scope_or_page_bound(group: str, rows: int) -> None:
    module = load_module("event_search_index_benchmark")
    connection = MagicMock()
    cursor = connection.cursor.return_value.__enter__.return_value
    cursor.fetchall.return_value = [tuple([None] * 11 + [group])] * rows
    with pytest.raises(module.QueryBenchmarkError, match="search_results_or_scope_changed"):
        module.verified_results(connection, ("owned", "oracle"), module.SearchCase("rare", "needlealpha"))


def test_result_order_or_null_change_fails_equivalence() -> None:
    module = load_module("event_search_index_benchmark")
    connection = MagicMock()
    cursor = connection.cursor.return_value.__enter__.return_value
    cursor.fetchall.side_effect = [[("first",)], [("second",)]]
    with pytest.raises(module.QueryBenchmarkError):
        module.verified_results(connection, ("owned", "oracle"), module.SearchCase("rare", "needlealpha"))


def test_connection_closes_and_failure_output_does_not_leak_database_exception(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    module = load_module("event_search_index_benchmark")
    connection = MagicMock()
    monkeypatch.setattr(module, "connect_fixture", lambda: connection)
    monkeypatch.setattr(module, "initialize_profiles", MagicMock(side_effect=module.psycopg2.Error("secret-sql-host")))
    monkeypatch.setattr(module.sys, "argv", ["benchmark", "--run"])
    assert module.main() == 1
    connection.close.assert_called_once()
    report = json.loads(capsys.readouterr().out)
    assert report == {
        "schema_version": module.SCHEMA_VERSION,
        "result": "FAIL",
        "error_code": "search_benchmark_failed",
    }


def test_default_cli_never_connects_or_reports_pass(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    module = load_module("event_search_index_benchmark")
    connect = MagicMock(side_effect=AssertionError("must not connect"))
    monkeypatch.setattr(module, "connect_fixture", connect)
    monkeypatch.setattr(module.sys, "argv", ["benchmark"])
    assert module.main() == 0
    assert json.loads(capsys.readouterr().out)["result"] == "NOT_RUN"
    connect.assert_not_called()


@pytest.mark.parametrize("invalid", [True, -1, float("nan"), float("inf"), "private-query", None])
def test_scan_work_rejects_invalid_or_nonfinite_plan_counts(invalid: object) -> None:
    module = load_module("event_search_index_benchmark")
    with pytest.raises(module.QueryBenchmarkError, match="search_scan_measurement_invalid"):
        module.scan_work([{"Actual Rows": invalid, "Actual Loops": 1}], "Actual Rows")


def test_scan_work_counts_loops_without_logging_plan_text() -> None:
    module = load_module("event_search_index_benchmark")
    assert (
        module.scan_work([{"Actual Rows": 3, "Actual Loops": 2}, {"Actual Rows": 0, "Actual Loops": 0}], "Actual Rows")
        == 6
    )


def test_search_access_evidence_exposes_only_owned_index_flag_and_counts() -> None:
    module = load_module("event_search_index_benchmark")
    connection = MagicMock()
    cursor = connection.cursor.return_value.__enter__.return_value
    cursor.fetchone.return_value = (
        [
            {
                "Execution Time": 1.0,
                "Plan": {
                    "Relation Name": "operational_events",
                    "Index Cond": "private-query",
                    "Actual Rows": 51,
                    "Actual Loops": 1,
                    "Plans": [{"Index Name": "event_text_trgm"}],
                },
            }
        ],
    )
    measurement, access = module.search_measurement(connection, "owned", module.SearchCase("rare", "needle"))
    assert measurement.execution_ms == 1
    assert access == {"gin_used": True, "scanned_rows": 51, "filtered_rows": 0}
    assert "private-query" not in json.dumps(access)


def test_wrong_insert_count_is_a_failure_not_a_timing_sample() -> None:
    fixture = load_module("event_search_fixture")
    connection = MagicMock()
    cursor = connection.cursor.return_value.__enter__.return_value
    cursor.fetchone.return_value = ("0/1",)
    cursor.rowcount = 999
    with pytest.raises(fixture.QueryBenchmarkError, match="search_write_count_changed"):
        fixture.append_batch(connection, 1)


def test_ci_runs_fixture_comparison_and_uploads_evidence_as_a_backend_step() -> None:
    workflow = yaml.safe_load((BENCHMARKS.parents[1] / ".github/workflows/ci.yml").read_text(encoding="utf-8"))
    steps = workflow["jobs"]["backend-test"]["steps"]
    uploads = [step for step in steps if step.get("with", {}).get("name") == "event-search-index-benchmark"]
    assert len(uploads) == 1
    assert uploads[0]["with"]["if-no-files-found"] == "error"
    assert any("event_search_index_benchmark.py" in step.get("run", "") for step in steps)
