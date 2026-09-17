import importlib.util
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts/reports/os_package_license_evidence.py"


def load_module():
    spec = importlib.util.spec_from_file_location("os_package_license_evidence", SCRIPT)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def test_os_package_name_decodes_exact_purl() -> None:
    module = load_module()

    assert module.package_name("pkg:deb/debian/libstdc%2B%2B6@12?arch=amd64") == "libstdc++6"
    assert module.package_name("pkg:golang/example@v1") is None
