from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[2]
COMPOSE = ROOT / "deploy/compose/compose.single-node.poc.yml"


def test_production_internal_policy_rpc_requires_mtls_files() -> None:
    compose = yaml.safe_load(COMPOSE.read_text(encoding="utf-8"))
    auth = compose["services"]["auth-policy"]
    media = compose["services"]["media-control"]

    assert auth["environment"]["GCS_INTERNAL_GRPC_ENABLED"] == "true"
    assert auth["environment"]["GCS_INTERNAL_GRPC_CA_FILE"].endswith("/ca.crt")
    assert media["environment"]["AUTH_POLICY_GRPC_TARGET"] == "auth-policy:9091"
    assert media["environment"]["AUTH_POLICY_GRPC_SERVER_NAME"] == "auth-policy"
    assert "ALLOW_PLAINTEXT" not in str(auth["environment"])
    assert "ALLOW_PLAINTEXT" not in str(media["environment"])
    for service in (auth, media):
        mount = next(
            item for item in service["volumes"] if isinstance(item, dict) and item["target"] == "/run/secrets/gcs-pki"
        )
        assert mount["read_only"] is True
