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
    backend_secrets = {item["target"]: item for item in services["backend"]["secrets"]}
    auth_secrets = {item["target"]: item for item in services["auth-policy"]["secrets"]}
    assert backend_secrets["AUTH_JWT_SECRET"]["mode"] == 0o400
    assert auth_secrets["AUTH_POLICY_JWT_SECRET"]["mode"] == 0o400


def test_postgres_credentials_are_delivered_as_service_scoped_files() -> None:
    document = yaml.safe_load(COMPOSE.read_text(encoding="utf-8"))
    services = document["services"]

    assert document["secrets"]["postgres_password"] == {"environment": "POSTGRES_PASSWORD"}
    assert document["secrets"]["database_url"] == {"environment": "DATABASE_URL"}
    assert services["postgres-geo"]["environment"]["POSTGRES_PASSWORD_FILE"] == "/run/secrets/POSTGRES_PASSWORD"
    assert "POSTGRES_PASSWORD" not in services["postgres-geo"]["environment"]
    assert services["backend"]["environment"]["DATABASE_URL_FILE"] == "/run/secrets/DATABASE_URL"
    assert "DATABASE_URL" not in services["backend"]["environment"]
    assert "SPRING_DATASOURCE_PASSWORD" not in services["auth-policy"]["environment"]
    assert {item["target"] for item in services["auth-policy"]["secrets"]} >= {"SPRING_DATASOURCE_PASSWORD"}
