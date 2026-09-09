import importlib.util
import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
MODULE_PATH = REPO_ROOT / "scripts" / "smoke" / "latency_budget.py"


def load_module():
    spec = importlib.util.spec_from_file_location("latency_budget", MODULE_PATH)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def test_playback_and_talkback_budgets_have_explicit_thresholds() -> None:
    module = load_module()

    assert module.classify_latency("playback", 999) == "PASS"
    assert module.classify_latency("playback", 1000) == "WARN"
    assert module.classify_latency("playback", 2000) == "FAIL"
    assert module.classify_latency("talkback", 499) == "PASS"
    assert module.classify_latency("talkback", 500) == "WARN"
    assert module.classify_latency("talkback", 1000) == "FAIL"


def test_failure_budget_is_fail_closed() -> None:
    module = load_module()

    with pytest.raises(RuntimeError, match="talkback first-frame latency exceeded 1000 ms"):
        module.require_latency_budget("talkback", 1000)
