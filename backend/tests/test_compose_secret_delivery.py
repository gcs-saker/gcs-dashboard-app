from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[2]
COMPOSE = ROOT / "deploy/compose/compose.single-node.poc.yml"


def test_shared_jwt_secret_is_file_scoped_and_absent_from_container_environment() -> None:
    document = yaml.safe_load(COMPOSE.read_text(encoding="utf-8"))
    services = document["services"]

    assert document["secrets"]["auth_jwt_secret"] == {"environment": "AUTH_JWT_SECRET"}
    assert "AUTH_JWT_SECRET" not in services["backend"]["environment"]
    assert "AUTH_POLICY_JWT_SECRET" not in services["auth-policy"]["environment"]
    assert services["auth-policy"]["environment"]["SPRING_CONFIG_IMPORT"] == "configtree:/run/secrets/"
    assert services["backend"]["secrets"] == [
        {"source": "auth_jwt_secret", "target": "AUTH_JWT_SECRET", "uid": "10001", "gid": "10001", "mode": 0o400}
    ]
    assert services["auth-policy"]["secrets"] == [
        {
            "source": "auth_jwt_secret",
            "target": "AUTH_POLICY_JWT_SECRET",
            "uid": "10002",
            "gid": "10002",
            "mode": 0o400,
        }
    ]
