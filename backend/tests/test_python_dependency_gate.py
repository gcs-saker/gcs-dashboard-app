import runpy
from pathlib import Path
from typing import Callable, cast

import pytest

ROOT = Path(__file__).resolve().parents[2]
MODULE = runpy.run_path(str(ROOT / "scripts/gates/python_dependency_gate.py"))
PythonDependencyError = cast(type[BaseException], MODULE["PythonDependencyError"])
validate = cast(Callable[[Path, Path], None], MODULE["validate"])


def test_repository_python_dependency_declarations_pass() -> None:
    validate(ROOT / "backend/requirements-runtime.txt", ROOT / "backend/requirements.txt")


def test_duplicate_runtime_requirement_is_rejected(tmp_path: Path) -> None:
    runtime = tmp_path / "runtime.txt"
    development = tmp_path / "development.txt"
    runtime.write_text("grpcio==1.76.0\n", encoding="utf-8")
    development.write_text("-r runtime.txt\ngrpcio[tools]>=1.70\n", encoding="utf-8")

    with pytest.raises(PythonDependencyError, match="grpcio"):
        validate(runtime, development)
