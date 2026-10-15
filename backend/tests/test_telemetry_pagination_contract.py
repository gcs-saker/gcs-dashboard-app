import importlib
import json
import re
import sys
from pathlib import Path
from types import ModuleType

import pytest

ROOT = Path(__file__).resolve().parents[2]
KOTLIN = ROOT / "services/auth-policy/src/main/kotlin/kr/co/a4ai/gcssaker/authpolicy"
CONTRACT = json.loads((ROOT / "contracts/rest/v1/telemetry-page.contract.json").read_text(encoding="utf-8"))


def load_script(directory: str, name: str) -> ModuleType:
    path = str(ROOT / "scripts" / directory)
    if path not in sys.path:
        sys.path.insert(0, path)
    return importlib.import_module(name)


def test_rest_pagination_contract_matches_owned_limits_and_routes() -> None:
    routes = (KOTLIN / "api/operations/reads/OperationalReadApiRoutes.kt").read_text(encoding="utf-8")
    assert f'TELEMETRY_PAGE = "{CONTRACT["path"]}"' in routes
    assert f'TELEMETRY_ALL = "{CONTRACT["compatibility"]["legacyPath"]}"' in routes
    limits = (KOTLIN / "domain/operations/TelemetryPagination.kt").read_text(encoding="utf-8")
    expected = {
        "DEFAULT_SIZE": CONTRACT["query"]["limit"]["default"],
        "MAX_SIZE": CONTRACT["query"]["limit"]["maximum"],
        "MAX_CURSOR_LENGTH": CONTRACT["query"]["cursor"]["maxLength"],
        "CURSOR_TTL_SECONDS": CONTRACT["cursor"]["ttlSeconds"],
    }
    for name, value in expected.items():
        assert re.search(rf"const val {name} = {value}(?:L)?\b", limits)
    assert CONTRACT["cursor"]["purpose"] in limits


def test_keyset_query_is_owned_bounded_parameterized_and_contains_no_offset() -> None:
    benchmark = load_script("benchmarks", "telemetry_keyset_benchmark")
    queries = benchmark.owned_queries(100_000)
    assert "OFFSET" not in queries.seek_sql
    assert queries.seek_sql.count("%s") == 7
    assert queries.offset_sql.count("%s") == 7
    assert queries.seek_parameters[-1] == 51
    assert queries.skipped_rows == 15_000


def test_range_plan_contract_distinguishes_seek_from_equality_without_logging_conditions() -> None:
    plans = load_script("benchmarks", "event_query_plan")
    assert plans.uuid_range_scan({"Plans": [{"Index Cond": "((uuid)::text > 'synthetic')"}]})
    assert not plans.uuid_range_scan({"Index Cond": "uuid = 'synthetic' AND other_column > 1"})
    assert not plans.uuid_range_scan({"Node Type": "Seq Scan"})
    result = plans.plan_measurement([{"Execution Time": 1.0, "Plan": {"Index Cond": "uuid > 'private-canary'"}}])
    assert "private-canary" not in json.dumps(result.as_report())


@pytest.mark.parametrize(
    "base",
    [
        "http://server-02:55122",
        "https://gcs-saker.com",
        "http://example.com",
        "http://localhost@server-01",
        "http://127.0.0.1/?token=x",
        "http://127.0.0.1/path",
        "file:///tmp/fixture",
    ],
)
def test_runtime_smoke_cannot_probe_nonlocal_or_ambiguous_targets(base: str) -> None:
    smoke = load_script("smoke", "telemetry_page_smoke")
    with pytest.raises(smoke.TelemetryPageSmokeError):
        smoke.validate_local_base(base)


def test_runtime_smoke_refuses_redirects_instead_of_following_an_external_target() -> None:
    smoke = load_script("smoke", "telemetry_page_smoke")
    assert smoke.NoFixtureRedirect().redirect_request(None, None, 302, "redirect", {}, "http://server-02") is None


@pytest.mark.parametrize("payload", [{"items": []}, {"items": [{"uuid": "a"}, {"uuid": "b"}], "nextCursor": None}])
def test_runtime_smoke_rejects_missing_envelopes_or_ignored_limits(
    monkeypatch: pytest.MonkeyPatch, payload: object
) -> None:
    smoke = load_script("smoke", "telemetry_page_smoke")
    monkeypatch.setattr(smoke, "fetch", lambda *_args: smoke.SmokeResponse(200, payload, True))
    with pytest.raises(smoke.TelemetryPageSmokeError):
        smoke.walk_pages("http://127.0.0.1/api/telemetry/page", "fixture")


def test_runtime_walk_detects_duplicates_and_unbounded_repeated_cursors(monkeypatch: pytest.MonkeyPatch) -> None:
    smoke = load_script("smoke", "telemetry_page_smoke")
    replies = iter(
        [
            smoke.SmokeResponse(200, {"items": [{"uuid": "a"}], "nextCursor": "next"}, True),
            smoke.SmokeResponse(200, {"items": [{"uuid": "a"}], "nextCursor": None}, True),
        ]
    )
    monkeypatch.setattr(smoke, "fetch", lambda *_args: next(replies))
    with pytest.raises(smoke.TelemetryPageSmokeError, match="multiple_unique_pages"):
        smoke.walk_pages("http://127.0.0.1/api/telemetry/page", "fixture")
    monkeypatch.setattr(
        smoke, "fetch", lambda *_args: smoke.SmokeResponse(200, {"items": [], "nextCursor": "next"}, True)
    )
    with pytest.raises(smoke.TelemetryPageSmokeError, match="page_walk_limit_exceeded"):
        smoke.walk_pages("http://127.0.0.1/api/telemetry/page", "fixture")
