from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path

REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
GATE_PATH = REPOSITORY_ROOT / "scripts/gates/directory_density_gate.py"


def load_gate():
    spec = spec_from_file_location("directory_density_gate", GATE_PATH)
    assert spec is not None and spec.loader is not None
    module = module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_production_directories_remain_below_density_limit() -> None:
    gate = load_gate()
    assert gate.density_violations(REPOSITORY_ROOT) == []


def test_gate_ignores_generated_and_test_sources(tmp_path: Path) -> None:
    gate = load_gate()
    for index in range(gate.MAX_PRODUCTION_FILES_PER_DIRECTORY + 5):
        generated = tmp_path / "services/media-control/internal/generated/example" / f"generated_{index}.go"
        generated.parent.mkdir(parents=True, exist_ok=True)
        generated.write_text("package example\n", encoding="utf-8")
    assert gate.density_violations(tmp_path) == []
