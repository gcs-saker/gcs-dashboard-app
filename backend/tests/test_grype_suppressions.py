from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[2]


def test_graphql_guava_metadata_suppression_requires_fixed_runtime() -> None:
    config = yaml.safe_load((ROOT / ".grype.yaml").read_text())
    rule = config["ignore"][0]
    build = (ROOT / "services/auth-policy/build.gradle.kts").read_text()

    assert rule["vulnerability"] == "GHSA-xxph-c9ww-hj94"
    assert rule["package"] == {
        "name": "guava",
        "version": "32.1.2-jre",
        "type": "java-archive",
    }
    assert "without com/google/common bytecode" in rule["reason"]
    assert 'implementation("com.google.guava:guava:33.7.2-jre")' in build
