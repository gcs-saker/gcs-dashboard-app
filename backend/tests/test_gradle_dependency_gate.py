import runpy
from pathlib import Path
from typing import Any, Callable, cast

import pytest

ROOT = Path(__file__).resolve().parents[2]
MODULE = runpy.run_path(str(ROOT / "scripts/gates/gradle_dependency_gate.py"))
GradleDependencyError = cast(type[BaseException], MODULE["GradleDependencyError"])
load_inventory = cast(Callable[[Path], list[dict[str, Any]]], MODULE["load_inventory"])
validate = cast(Callable[[str, list[dict[str, Any]]], None], MODULE["validate"])


def test_auth_policy_dependency_inventory_matches_build() -> None:
    build_text = (ROOT / "services/auth-policy/build.gradle.kts").read_text(encoding="utf-8")
    inventory = load_inventory(ROOT / "docs/compliance/supply-chain/auth-policy-dependencies.yml")

    validate(build_text, inventory)


def test_unowned_gradle_dependency_is_rejected() -> None:
    build_text = 'dependencies {\n    implementation("example:unowned:1.0")\n}\n'

    with pytest.raises(GradleDependencyError, match="missing=.*example:unowned:1.0"):
        validate(build_text, [])
