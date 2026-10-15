import json
from datetime import UTC, datetime, timedelta, timezone
from decimal import Decimal
from unittest.mock import MagicMock

import pytest
import yaml

from tests.test_operational_event_query_benchmark import BENCHMARKS, load_module


def owned_source() -> str:
    plans = load_module("event_query_plan")
    return (BENCHMARKS.parents[1] / plans.SQL_SOURCE).read_text(encoding="utf-8")


def test_rollup_preserves_owned_scope_bounds_bucket_limit_and_weighted_null_averages() -> None:
    module = load_module("event_rollup_queries")
    queries = module.owned_rollup_queries(owned_source())
    case = module.RollupCase("own", module.RollupScope())
    for kind in ("metrics", "buckets"):
        raw, candidate = queries.pair(kind, case)
        assert raw.count("%s") == candidate.count("%s") == 5
        assert "c.descendant_group_id = operational_events.group_id" in candidate
        assert "SUM(latency_sum) / NULLIF(SUM(latency_count), 0)" in candidate
        assert "AVG(avg_" not in candidate
    assert queries.pair("buckets", case)[1].endswith("LIMIT 1440")


@pytest.mark.parametrize(
    "name", ["selectMetricsBase", "selectTimeBucketsBase", "groupByTimeBucket", "andOccurredAtFrom", "andOccurredAtTo"]
)
def test_missing_owned_fragment_is_rejected(name: str) -> None:
    module = load_module("event_rollup_queries")
    with pytest.raises(module.QueryBenchmarkError):
        module.owned_rollup_queries(owned_source().replace("const val " + name, "const val removed_" + name))


@pytest.mark.parametrize(
    "before,after",
    [
        ("AVG(latency_ms)", "SUM(latency_ms)"),
        ("LIMIT 1440", "LIMIT 100000"),
        ("AND occurred_at <= ?", "AND occurred_at < ?"),
        ("COUNT(1)", "COUNT(latency_ms)"),
    ],
)
def test_changed_aggregate_or_time_semantics_cannot_silently_pass(before: str, after: str) -> None:
    module = load_module("event_rollup_queries")
    with pytest.raises(module.QueryBenchmarkError):
        module.owned_rollup_queries(owned_source().replace(before, after))


def test_differing_scope_between_metrics_and_buckets_is_rejected() -> None:
    module = load_module("event_rollup_queries")
    source = owned_source().replace("WHERE (group_id = ?", "WHERE (group_id <> ?", 1)
    # selectBase is first: change metrics specifically as well, leaving buckets untouched.
    source = source.replace("WHERE (group_id = ?", "WHERE (group_id <> ?", 1)
    with pytest.raises(module.QueryBenchmarkError, match="rollup_scope_contract_changed"):
        module.owned_rollup_queries(source)


@pytest.mark.parametrize("second,microsecond,eligible", [(0, 0, True), (0, 1, False), (1, 0, False)])
def test_start_minute_boundary_is_exact(second: int, microsecond: int, eligible: bool) -> None:
    module = load_module("event_rollup_queries")
    start = datetime(2026, 10, 15, second=second, microsecond=microsecond, tzinfo=UTC)
    end = datetime(2026, 10, 15, 0, 0, 59, 999999, tzinfo=UTC)
    assert module.RollupWindow(start, end).eligible is eligible


@pytest.mark.parametrize("second,microsecond,eligible", [(59, 999999, True), (59, 999998, False), (0, 0, False)])
def test_inclusive_end_minute_boundary_is_exact(second: int, microsecond: int, eligible: bool) -> None:
    module = load_module("event_rollup_queries")
    start = datetime(2026, 10, 15, tzinfo=UTC)
    end = start.replace(second=second, microsecond=microsecond)
    assert module.RollupWindow(start, end).eligible is eligible


def test_timezone_aware_equivalent_window_and_invalid_windows() -> None:
    module = load_module("event_rollup_queries")
    start = datetime(2026, 10, 15, 9, tzinfo=timezone(timedelta(hours=9)))
    assert module.RollupWindow(start, start + timedelta(minutes=1) - timedelta(microseconds=1)).eligible
    with pytest.raises(module.QueryBenchmarkError):
        module.RollupWindow(datetime(2026, 10, 15), start)
    with pytest.raises(module.QueryBenchmarkError):
        module.RollupWindow(start, start - timedelta(microseconds=1))


def test_partial_window_and_unknown_query_kind_fail_before_sql() -> None:
    module = load_module("event_rollup_queries")
    queries = module.owned_rollup_queries(owned_source())
    start = datetime(2026, 10, 15, tzinfo=UTC)
    case = module.RollupCase("partial", module.RollupScope(), module.RollupWindow(start, start))
    with pytest.raises(module.QueryBenchmarkError, match="rollup_partial_window_unsupported"):
        queries.pair("metrics", case)
    with pytest.raises(module.QueryBenchmarkError, match="rollup_kind_invalid"):
        queries.pair("private-query", case)


@pytest.mark.parametrize(
    "actual,expected,result",
    [
        (None, None, True),
        (None, 0, False),
        (True, 1, False),
        (float("nan"), float("nan"), False),
        (float("inf"), float("inf"), False),
        (Decimal("1.25"), 1.25, True),
        (Decimal("1.25000000000001"), 1.25, True),
        (Decimal("1.251"), 1.25, False),
    ],
)
def test_numeric_null_and_nonfinite_equivalence_boundaries(actual: object, expected: object, result: bool) -> None:
    module = load_module("event_rollup_queries")
    assert module.values_equal(actual, expected) is result


def test_rows_require_same_order_arity_and_exact_integer_counts() -> None:
    module = load_module("event_rollup_queries")
    assert not module.rows_equal([(1,), (2,)], [(2,), (1,)])
    assert not module.rows_equal([(1, 2)], [(1,)])
    assert not module.rows_equal([(1,)], [])
    assert not module.values_equal(2**60, 2**60 + 1)


@pytest.mark.parametrize("row", [("other", None), ("gcs_query_benchmark", "already_exists"), None])
def test_fixture_refuses_overwriting_namespace_or_wrong_database_before_ddl(row: object) -> None:
    module = load_module("event_rollup_fixture")
    connection = MagicMock()
    cursor = connection.cursor.return_value.__enter__.return_value
    cursor.fetchone.return_value = row
    with pytest.raises(module.QueryBenchmarkError, match="rollup_fixture_must_be_new"):
        module.initialize_rollup(connection, module.BenchmarkOptions())
    assert cursor.execute.call_count == 1
    assert cursor.execute.call_args.args[0].startswith("SELECT")


def test_independent_oracle_uses_explicit_groups_and_same_time_contract() -> None:
    module = load_module("operational_rollup_benchmark")
    queries = module.owned_rollup_queries(owned_source())
    case = next(case for case in module.CASES if case.name == "aligned_window")
    statement, parameters = module.oracle_query(queries, "buckets", case)
    assert "group_id = ANY(%s)" in statement
    assert "organization_group_closure" not in statement
    assert "occurred_at >= %s" in statement and "occurred_at <= %s" in statement
    assert parameters[0] == ["co-a"]
    assert statement.endswith("LIMIT 1440")


def test_late_probe_does_not_report_success_when_append_did_not_change_results(monkeypatch: pytest.MonkeyPatch) -> None:
    module = load_module("operational_rollup_benchmark")
    connection = MagicMock()
    connection.cursor.return_value.__enter__.return_value.rowcount = 1
    monkeypatch.setattr(module, "read_rows", lambda *_: [(0, 0, None, None, None, None)])
    with pytest.raises(module.QueryBenchmarkError, match="rollup_staleness_counterexample_missing"):
        module.late_event_probe(connection, module.owned_rollup_queries(owned_source()))


def test_count_mismatch_is_rejected_even_beyond_float_precision(monkeypatch: pytest.MonkeyPatch) -> None:
    module = load_module("operational_rollup_benchmark")
    actual = [(2**60, 0, None, None, None, None)]
    rounded_equal = [(Decimal(2**60 + 1), 0, None, None, None, None)]
    monkeypatch.setattr(module, "read_rows", MagicMock(side_effect=[actual, rounded_equal, actual]))
    with pytest.raises(module.QueryBenchmarkError, match="rollup_result_or_scope_changed"):
        module.verify_pair(MagicMock(), module.owned_rollup_queries(owned_source()), "metrics", module.CASES[0])


def test_profiles_cover_nonempty_all_null_bucket_and_independent_empty_scopes() -> None:
    module = load_module("operational_rollup_benchmark")
    assert {case.name for case in module.CASES} >= {
        "all_null_minute",
        "empty_group",
        "empty_window",
        "descendants_all",
        "global_all",
    }


def test_cli_default_never_connects_and_errors_are_redacted(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    module = load_module("operational_rollup_benchmark")
    connect = MagicMock(side_effect=AssertionError("must not connect"))
    monkeypatch.setattr(module, "connect_fixture", connect)
    monkeypatch.setattr(module.sys, "argv", ["benchmark"])
    assert module.main() == 0
    assert json.loads(capsys.readouterr().out)["result"] == "NOT_RUN"
    connect.assert_not_called()
    connection = MagicMock()
    monkeypatch.setattr(module, "connect_fixture", lambda: connection)
    monkeypatch.setattr(module, "initialize_rollup", MagicMock(side_effect=module.psycopg2.Error("private-host-sql")))
    monkeypatch.setattr(module.sys, "argv", ["benchmark", "--run"])
    assert module.main() == 1
    connection.close.assert_called_once()
    assert json.loads(capsys.readouterr().out) == {
        "schema_version": module.SCHEMA_VERSION,
        "result": "FAIL",
        "error_code": "rollup_benchmark_failed",
    }


def test_ci_executes_and_uploads_rollup_evidence() -> None:
    workflow = yaml.safe_load((BENCHMARKS.parents[1] / ".github/workflows/ci.yml").read_text(encoding="utf-8"))
    steps = workflow["jobs"]["backend-test"]["steps"]
    uploads = [step for step in steps if step.get("with", {}).get("name") == "operational-rollup-benchmark"]
    assert len(uploads) == 1 and uploads[0]["with"]["if-no-files-found"] == "error"
    assert any("operational_rollup_benchmark.py" in step.get("run", "") for step in steps)
