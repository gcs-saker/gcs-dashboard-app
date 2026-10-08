from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[2]


def test_mediamtx_management_api_requires_named_credentials_and_stays_private() -> None:
    for path in (
        ROOT / "gcs-dashboard" / "mediamtx.yml",
        ROOT / "deploy" / "mediamtx" / "mediamtx.closed-network.yml",
    ):
        config = yaml.safe_load(path.read_text(encoding="utf-8"))
        api_user = next(user for user in config["authInternalUsers"] if {"action": "api"} in user["permissions"])
        assert api_user["user"] == "${MEDIAMTX_API_USER}"
        assert api_user["pass"] == "${MEDIAMTX_API_PASSWORD}"
        assert api_user["user"] != "any"

    compose = (ROOT / "deploy" / "compose" / "compose.single-node.poc.yml").read_text(encoding="utf-8")
    assert "MEDIAMTX_API_PASSWORD" in compose
    assert "9997:9997" not in compose
