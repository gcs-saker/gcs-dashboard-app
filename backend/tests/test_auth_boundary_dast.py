import importlib.util
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts/smoke/auth_boundary_dast.py"


def load_module():
    spec = importlib.util.spec_from_file_location("auth_boundary_dast", SCRIPT)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def test_dast_scenarios_cover_owned_attack_boundaries() -> None:
    module = load_module()
    names = {scenario.name for scenario in module.scenarios()}

    assert names == {
        "admin_unauthenticated",
        "streams_unauthenticated",
        "publish_session_unauthenticated",
        "playback_idor_unauthenticated",
        "telemetry_unauthenticated",
        "invalid_bearer_admin",
        "graphql_unauthenticated",
        "websocket_unauthenticated",
        "login_malformed_json",
        "login_oversized",
        "admin_path_traversal",
    }


def test_remote_dast_requires_explicit_https_approval() -> None:
    module = load_module()

    with pytest.raises(ValueError, match="explicit approval"):
        module.validate_target("https://example.test", allow_remote=False)
    with pytest.raises(ValueError, match="explicit approval"):
        module.validate_target("http://example.test", allow_remote=True)
    module.validate_target("https://example.test", allow_remote=True)
    module.validate_target("http://127.0.0.1:8080", allow_remote=False)


def test_dast_payload_scenarios_reach_the_body_parser_without_a_cors_preflight() -> None:
    module = load_module()
    payload_scenarios = [item for item in module.scenarios() if item.body is not None]

    assert payload_scenarios
    assert all("Origin" not in item.headers for item in payload_scenarios)


def test_dast_results_never_return_response_content(monkeypatch: pytest.MonkeyPatch) -> None:
    module = load_module()

    class FakeResponse:
        status = 401

        def __enter__(self):
            return self

        def __exit__(self, *_):
            return None

        def read(self, _limit):
            return b'{"code":"authentication_required"}'

    monkeypatch.setattr(module, "urlopen", lambda *_args, **_kwargs: FakeResponse())
    result = module.execute("http://127.0.0.1:8080", module.scenarios()[0])

    assert result["result"] == "PASS"
    assert result["leakageDetected"] is False
    assert "body" not in result


def test_dast_fails_on_internal_secret_or_stack_marker(monkeypatch: pytest.MonkeyPatch) -> None:
    module = load_module()

    class LeakingResponse:
        status = 401

        def __enter__(self):
            return self

        def __exit__(self, *_):
            return None

        def read(self, _limit):
            return b"Traceback: jdbc:postgresql://internal"

    monkeypatch.setattr(module, "urlopen", lambda *_args, **_kwargs: LeakingResponse())

    assert module.execute("http://127.0.0.1:8080", module.scenarios()[0])["result"] == "FAIL"


def test_dast_evidence_is_exclusive_and_contains_no_response_body(tmp_path: Path) -> None:
    module = load_module()
    output = (tmp_path / "dast.json").resolve()
    module.emit_report({"results": [{"bodyBytes": 10, "result": "PASS"}]}, output)

    assert "bodyBytes" in output.read_text(encoding="utf-8")
    assert "response_body" not in output.read_text(encoding="utf-8")
    with pytest.raises(ValueError, match="new and absolute"):
        module.emit_report({}, output)
