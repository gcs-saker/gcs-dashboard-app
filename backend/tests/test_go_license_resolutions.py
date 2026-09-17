from pathlib import Path

import yaml

REPO_ROOT = Path(__file__).resolve().parents[2]
RESOLUTIONS = REPO_ROOT / "docs/compliance/supply-chain/license-resolutions.yml"


def test_media_control_go_unknowns_have_exact_versioned_resolutions() -> None:
    entries = yaml.safe_load(RESOLUTIONS.read_text(encoding="utf-8"))["resolutions"]
    go_entries = [entry for entry in entries if entry["purl"].startswith("pkg:golang/")]

    assert len(go_entries) == 30
    assert len({entry["purl"] for entry in go_entries}) == 30
    assert all("@v" in entry["purl"] for entry in go_entries)
    assert all(entry["source"].startswith("https://") for entry in go_entries)
    assert all(entry["verifiedBy"] == "go-licenses-v2.0.1" for entry in go_entries)
    assert all(str(entry["verifiedOn"]) == "2026-09-17" for entry in go_entries)


def test_paho_epl_remains_review_required_instead_of_being_silently_allowed() -> None:
    catalog = yaml.safe_load(RESOLUTIONS.read_text(encoding="utf-8"))["resolutions"]
    paho = next(entry for entry in catalog if entry["purl"] == "pkg:golang/github.com/eclipse/paho.mqtt.golang@v1.5.1")
    policy = yaml.safe_load(
        (REPO_ROOT / "docs/compliance/supply-chain/supply-chain-policy.yml").read_text(encoding="utf-8")
    )

    assert paho["licenseExpression"] == "EPL-2.0"
    assert "EPL-2.0" not in policy["allowedLicenses"]
