import importlib.util
import sys
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts/reports/maven_license_evidence.py"
RESOLUTIONS = ROOT / "docs/compliance/supply-chain/license-resolutions.yml"


def load_module():
    spec = importlib.util.spec_from_file_location("maven_license_evidence", SCRIPT)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def test_coordinate_parser_builds_version_pinned_maven_central_url() -> None:
    module = load_module()

    coordinate = module.coordinate_from_purl("pkg:maven/io.grpc/grpc-core@1.76.0")

    assert coordinate.pom_url == "https://repo1.maven.org/maven2/io/grpc/grpc-core/1.76.0/grpc-core-1.76.0.pom"


def test_pom_license_parser_preserves_name_and_url() -> None:
    module = load_module()
    root = module.ET.fromstring(
        "<project><licenses><license><name>Apache License 2.0</name>"
        "<url>https://www.apache.org/licenses/LICENSE-2.0.txt</url></license></licenses></project>"
    )

    assert module.pom_licenses(root) == [
        {"name": "Apache License 2.0", "url": "https://www.apache.org/licenses/LICENSE-2.0.txt"}
    ]


def test_known_pom_license_names_normalize_without_weakening_review_licenses() -> None:
    module = load_module()

    assert module.spdx_expression([{"name": "Apache 2.0", "url": "https://example.test"}]) == "Apache-2.0"
    assert module.spdx_expression([{"name": "EPL-2.0", "url": "https://example.test"}]) == "EPL-2.0"
    assert module.spdx_expression([{"name": "Public Domain", "url": "https://example.test"}]) is None


def test_first_maven_resolution_batch_is_exact_and_version_pinned() -> None:
    entries = yaml.safe_load(RESOLUTIONS.read_text(encoding="utf-8"))["resolutions"]
    maven_entries = [entry for entry in entries if entry.get("verifiedBy") == "maven-pom-evidence-v1"]

    assert len(maven_entries) == 46
    assert len({entry["purl"] for entry in maven_entries}) == 46
    assert all(entry["purl"].startswith("pkg:maven/") and "@" in entry["purl"] for entry in maven_entries)
    assert all("repo1.maven.org/maven2/" in entry["source"] for entry in maven_entries)
