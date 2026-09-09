from pathlib import Path

import yaml

REPO_ROOT = Path(__file__).resolve().parents[2]
PROFILE = REPO_ROOT / "docs/compliance/security/secure-communications-profile.yml"
INVENTORY = REPO_ROOT / "docs/compliance/security/cryptographic-inventory.yml"


def test_secure_channel_profile_fails_closed_without_overstating_completion() -> None:
    profile = yaml.safe_load(PROFILE.read_text(encoding="utf-8"))
    channels = {item["id"]: item for item in profile["channels"]}

    assert profile["defaultPolicy"] == "plaintext-denied-outside-local-test"
    assert set(channels) == {
        "CH-PUBLIC-HTTPS",
        "CH-GRPC-POLICY",
        "CH-MQTT-DEVICE",
        "CH-POSTGRES",
        "CH-REDIS",
        "CH-TURN",
        "CH-ADMIN-MFA",
    }
    assert channels["CH-GRPC-POLICY"]["currentStatus"] == "IMPLEMENTED_NOT_DEPLOYED"
    assert channels["CH-MQTT-DEVICE"]["currentStatus"] == "IMPLEMENTED_NOT_DEPLOYED"
    assert channels["CH-TURN"]["currentStatus"] == "IMPLEMENTED_NOT_DEPLOYED"
    assert channels["CH-ADMIN-MFA"]["currentStatus"] == "IMPLEMENTED_ENROLLMENT_PENDING"
    assert all(item["issue"] == 662 for item in channels.values())


def test_crypto_inventory_never_implies_fips_without_assessment() -> None:
    inventory = yaml.safe_load(INVENTORY.read_text(encoding="utf-8"))

    assert all(item["fipsStatus"] == "NOT_ASSESSED" for item in inventory["items"])
    assert any(item["validationStatus"] == "OPEN" for item in inventory["items"])
