import runpy
from copy import deepcopy
from pathlib import Path
from typing import Any, Callable, cast

import pytest

ROOT = Path(__file__).resolve().parents[2]
MODULE = runpy.run_path(str(ROOT / "scripts/gates/runtime_lifecycle_gate.py"))
RuntimeLifecycleError = cast(type[BaseException], MODULE["RuntimeLifecycleError"])
load_policy = cast(Callable[[], dict[str, Any]], MODULE["load_policy"])
validate = cast(Callable[[dict[str, Any]], None], MODULE["validate"])


def test_current_runtime_policy_passes() -> None:
    validate(load_policy())


def test_eol_node_runtime_is_rejected() -> None:
    policy = deepcopy(load_policy())
    policy["minimumSupported"]["node"] = 99

    with pytest.raises(RuntimeLifecycleError, match="Node runtime"):
        validate(policy)


def test_unused_dependency_exception_is_rejected() -> None:
    policy = deepcopy(load_policy())
    policy["unusedDependencyExceptions"] = ["unreviewed-package"]

    with pytest.raises(RuntimeLifecycleError, match="unused dependency"):
        validate(policy)
