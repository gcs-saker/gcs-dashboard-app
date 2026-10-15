import importlib
import sys
from pathlib import Path
from types import ModuleType

import pytest

BENCHMARKS = Path(__file__).resolve().parents[2] / "scripts/benchmarks"


def load_module(name: str) -> ModuleType:
    if str(BENCHMARKS) not in sys.path:
        sys.path.insert(0, str(BENCHMARKS))
    return importlib.import_module(name)


@pytest.mark.parametrize("rows,repeats,memory", [(1_000, 3, 64), (1_000_000, 31, 65_536)])
def test_benchmark_accepts_finite_boundary_profiles(rows: int, repeats: int, memory: int) -> None:
    module = load_module("operational_event_query_benchmark")
    assert module.BenchmarkOptions(rows, repeats, memory).rows == rows


@pytest.mark.parametrize(
    "rows,repeats,memory",
    [(999, 3, 64), (1_000_001, 3, 64), (1000, 2, 64), (1000, 32, 64), (1000, 3, 63), (1000, 3, 65_537)],
)
def test_benchmark_rejects_unbounded_fixture_profiles(rows: int, repeats: int, memory: int) -> None:
    module = load_module("operational_event_query_benchmark")
    with pytest.raises(module.QueryBenchmarkError):
        module.BenchmarkOptions(rows, repeats, memory)


@pytest.mark.parametrize("host", ["server-01", "server-02", "192.168.1.2", "example.com"])
def test_benchmark_refuses_nonfixture_database_hosts(monkeypatch: pytest.MonkeyPatch, host: str) -> None:
    module = load_module("operational_event_query_benchmark")
    monkeypatch.setenv("GCS_QUERY_BENCHMARK_HOST", host)
    monkeypatch.setenv("GCS_QUERY_BENCHMARK_PASSWORD", "fixture")
    with pytest.raises(module.QueryBenchmarkError):
        module.connect_fixture()


def test_owned_stream_query_is_loaded_with_unchanged_scope_parameters() -> None:
    module = load_module("event_query_plan")
    source = (BENCHMARKS.parents[1] / module.SQL_SOURCE).read_text(encoding="utf-8")
    sql = module.stream_metrics_sql(source)
    assert sql.count("%s") == 5
    assert "ARRAY_AGG" in sql
    assert "LIMIT 500" in sql


@pytest.mark.parametrize("name", ["current", "ranked", "window"])
def test_experimental_queries_reuse_the_owned_authorization_scope(name: str) -> None:
    plans = load_module("event_query_plan")
    candidates = load_module("event_query_candidates")
    source = (BENCHMARKS.parents[1] / plans.SQL_SOURCE).read_text(encoding="utf-8")
    owned = plans.stream_metrics_sql(source)
    sql = candidates.candidate_sql(owned, candidates.QueryCandidate(name))
    assert sql.count("%s") == 5
    assert "c.ancestor_group_id = %s" in sql
    assert "c.descendant_group_id = operational_events.group_id" in sql
    assert "LIMIT 500" in sql


def test_plan_measurements_count_root_buffers_once_and_disk_sort_nodes() -> None:
    module = load_module("event_query_plan")
    result = module.plan_measurement(
        [
            {
                "Execution Time": 1.25,
                "Plan": {
                    "Shared Hit Blocks": 9,
                    "Temp Written Blocks": 4,
                    "Plans": [{"Shared Hit Blocks": 9, "Sort Space Type": "Disk"}, {"Sort Space Type": "Memory"}],
                },
            }
        ]
    )
    assert result.shared_hit_blocks == 9
    assert result.temp_written_blocks == 4
    assert result.sort_spill_nodes == 1


@pytest.mark.parametrize(
    "payload",
    [
        None,
        [],
        [None],
        [{"Execution Time": float("nan"), "Plan": {}}],
        [{"Execution Time": float("inf"), "Plan": {}}],
        [{"Execution Time": True, "Plan": {}}],
        [{"Execution Time": -1, "Plan": {}}],
        [{"Execution Time": 1, "Plan": {"Shared Hit Blocks": -1}}],
        [{"Execution Time": 1, "Plan": {"Plans": "invalid"}}],
    ],
)
def test_invalid_measurements_are_not_reported_as_success(payload: object) -> None:
    module = load_module("event_query_plan")
    with pytest.raises(module.QueryBenchmarkError):
        module.plan_measurement(payload)


class FixtureCursor:
    def __init__(self, row: tuple[object, object]) -> None:
        self.row = row
        self.statements: list[str] = []

    def __enter__(self):
        return self

    def __exit__(self, *_arguments):
        return False

    def execute(self, statement: str, *_arguments) -> None:
        self.statements.append(statement)

    def fetchone(self):
        return self.row


class FixtureConnection:
    def __init__(self, row: tuple[object, object]) -> None:
        self.reader = FixtureCursor(row)
        self.read_only = False

    def __enter__(self):
        return self

    def __exit__(self, *_arguments):
        return False

    def cursor(self):
        return self.reader

    def set_session(self, readonly: bool) -> None:
        self.read_only = readonly


@pytest.mark.parametrize("row", [("gcs_query_benchmark", "operational_events"), ("other_database", None)])
def test_default_run_never_overwrites_an_existing_or_wrong_database(row: tuple[object, object]) -> None:
    module = load_module("operational_event_query_benchmark")
    connection = FixtureConnection(row)
    with pytest.raises(module.QueryBenchmarkError, match="fixture_must_be_new"):
        module.initialize_fixture(connection, module.BenchmarkOptions())
    assert len(connection.reader.statements) == 1
    assert connection.reader.statements[0].startswith("SELECT")


def test_repeat_measurement_sets_read_only_before_reading_and_never_mutates_rows() -> None:
    module = load_module("operational_event_query_benchmark")
    connection = FixtureConnection(("gcs_query_benchmark", 100_000))
    module.read_only_fixture(connection, module.BenchmarkOptions())
    assert connection.read_only
    assert all(statement.startswith(("SELECT", "SET")) for statement in connection.reader.statements)
