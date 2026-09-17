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


def test_identical_copyright_files_are_grouped_for_single_review() -> None:
    module = load_module()
    records = [
        {"package": "gcc-base", "sha256": "a" * 64},
        {"package": "libgcc", "sha256": "a" * 64},
        {"package": "missing", "status": "MISSING"},
    ]

    assert module.copyright_groups(records) == [
        {"sha256": "a" * 64, "packages": ["gcc-base", "libgcc"], "packageCount": 2}
    ]


def test_debian_license_labels_are_extracted_and_deduplicated() -> None:
    module = load_module()

    labels = module.declared_license_labels(
        "Files: *\nLicense: GPL-2+\n\nFiles: src/*\nLicense: BSD-3-clause\nLicense: GPL-2+\n"
    )

    assert labels == ["BSD-3-clause", "GPL-2+"]


def test_known_debian_labels_normalize_and_unknown_labels_fail_closed() -> None:
    module = load_module()

    normalized, unresolved = module.normalize_debian_labels(["GPL-2+", "Expat", "custom-license"])

    assert normalized == ["GPL-2.0-or-later", "MIT"]
    assert unresolved == ["custom-license"]
