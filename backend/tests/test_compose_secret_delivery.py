from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[2]
COMPOSE = ROOT / "deploy/compose/compose.single-node.poc.yml"
STATIC_TURN_OVERRIDE = ROOT / "deploy/compose/compose.static-turn-credential.override.yml"


def test_shared_jwt_secret_is_file_scoped_and_absent_from_container_environment() -> None:
    document = yaml.safe_load(COMPOSE.read_text(encoding="utf-8"))
    services = document["services"]

    assert document["secrets"]["auth_jwt_secret"]["file"].endswith("/AUTH_JWT_SECRET")
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

    assert document["secrets"]["postgres_password"]["file"].endswith("/POSTGRES_PASSWORD")
    assert document["secrets"]["database_url"]["file"].endswith("/DATABASE_URL")
    assert services["postgres-geo"]["environment"]["POSTGRES_PASSWORD_FILE"] == "/run/secrets/POSTGRES_PASSWORD"
    assert "POSTGRES_PASSWORD" not in services["postgres-geo"]["environment"]
    assert services["backend"]["environment"]["DATABASE_URL_FILE"] == "/run/secrets/DATABASE_URL"
    assert "DATABASE_URL" not in services["backend"]["environment"]
    assert "SPRING_DATASOURCE_PASSWORD" not in services["auth-policy"]["environment"]
    assert {item["target"] for item in services["auth-policy"]["secrets"]} >= {"SPRING_DATASOURCE_PASSWORD"}


def test_redis_password_is_file_scoped_for_server_and_clients() -> None:
    document = yaml.safe_load(COMPOSE.read_text(encoding="utf-8"))
    services = document["services"]

    assert document["secrets"]["redis_password"]["file"].endswith("/REDIS_PASSWORD")
    assert "REDIS_PASSWORD" not in services["redis"].get("environment", {})
    assert "SPRING_DATA_REDIS_PASSWORD" not in services["auth-policy"]["environment"]
    assert "MEDIA_CONTROL_REDIS_PASSWORD" not in services["media-control"]["environment"]
    assert {item["target"] for item in services["redis"]["secrets"]} == {"REDIS_PASSWORD"}
    assert {item["target"] for item in services["auth-policy"]["secrets"]} >= {"SPRING_DATA_REDIS_PASSWORD"}
    assert {item["target"] for item in services["media-control"]["secrets"]} >= {"MEDIA_CONTROL_REDIS_PASSWORD"}
    assert services["redis"]["entrypoint"] == ["/usr/local/bin/gcs-valkey-secret-entrypoint"]


def test_internal_service_tokens_are_scoped_files() -> None:
    document = yaml.safe_load(COMPOSE.read_text(encoding="utf-8"))
    services = document["services"]
    auth_targets = {item["target"] for item in services["auth-policy"]["secrets"]}
    media_targets = {item["target"] for item in services["media-control"]["secrets"]}

    assert {"GCS_INTERNAL_GRPC_TOKEN", "AUTH_POLICY_AUDIT_INGEST_TOKEN"} <= auth_targets
    assert {"AUTH_POLICY_RPC_TOKEN", "AUTH_POLICY_AUDIT_INGEST_TOKEN", "MEDIA_CONTROL_GRPC_TOKEN"} <= media_targets
    for name in ("AUTH_POLICY_RPC_TOKEN", "AUTH_POLICY_AUDIT_INGEST_TOKEN", "MEDIA_CONTROL_GRPC_TOKEN"):
        assert name not in services["media-control"]["environment"]


def test_turn_and_mediamtx_credentials_are_scoped_files() -> None:
    document = yaml.safe_load(COMPOSE.read_text(encoding="utf-8"))
    services = document["services"]

    assert "MEDIAMTX_API_PASSWORD" not in services["mediamtx"]["environment"]
    assert "MEDIAMTX_API_PASSWORD" not in services["media-control"]["environment"]
    assert "TURN_SHARED_SECRET" not in services["media-control"]["environment"]
    assert {item["target"] for item in services["mediamtx"]["secrets"]} == {"MEDIAMTX_API_PASSWORD"}
    assert {item["target"] for item in services["turn-primary"]["secrets"]} == {"TURN_SHARED_SECRET"}
    assert {item["target"] for item in services["media-control"]["secrets"]} >= {
        "MEDIAMTX_API_PASSWORD",
        "TURN_SHARED_SECRET",
    }


def test_auth_policy_operational_credentials_are_file_scoped() -> None:
    document = yaml.safe_load(COMPOSE.read_text(encoding="utf-8"))
    auth_policy = document["services"]["auth-policy"]
    targets = {item["target"] for item in auth_policy["secrets"]}
    expected = {
        "AUTH_POLICY_ADMIN_PASSWORD",
        "AUTH_POLICY_OPERATOR_PASSWORD",
        "AUTH_POLICY_SMOKE_PASSWORD",
        "AUTH_POLICY_ADMIN_MFA_SECRET",
        "AUTH_POLICY_ADMIN_MFA_RECOVERY_HASHES",
        "AUTH_POLICY_DEVICE_BOOTSTRAP_TOKENS",
        "AUTH_POLICY_SIGNUP_INVITES",
        "AUTH_POLICY_AUDIT_ANCHOR_HMAC_KEY",
    }

    assert expected <= targets
    assert expected.isdisjoint(auth_policy["environment"])
    for name in expected:
        source = next(item["source"] for item in auth_policy["secrets"] if item["target"] == name)
        assert document["secrets"][source]["file"].endswith(f"/{name}")


def test_production_services_do_not_receive_the_shared_environment_file() -> None:
    services = yaml.safe_load(COMPOSE.read_text(encoding="utf-8"))["services"]
    secret_names = {
        "AUTH_JWT_SECRET",
        "DATABASE_URL",
        "POSTGRES_PASSWORD",
        "REDIS_PASSWORD",
        "AUTH_POLICY_RPC_TOKEN",
        "AUTH_POLICY_AUDIT_INGEST_TOKEN",
        "MEDIA_CONTROL_GRPC_TOKEN",
        "MEDIAMTX_API_PASSWORD",
        "TURN_SHARED_SECRET",
        "TURN_PASSWORD",
    }

    assert all("env_file" not in service for service in services.values())
    for service in services.values():
        assert secret_names.isdisjoint(service.get("environment", {}))


def test_static_turn_password_requires_explicit_file_scoped_override() -> None:
    base = yaml.safe_load(COMPOSE.read_text(encoding="utf-8"))
    override = yaml.safe_load(STATIC_TURN_OVERRIDE.read_text(encoding="utf-8"))

    assert "turn_static_password" not in base["secrets"]
    assert override["secrets"]["turn_static_password"]["file"].endswith("/TURN_PASSWORD")
    assert override["services"]["media-control"]["environment"]["TURN_CREDENTIAL_MODE"] == "static"
    assert {item["target"] for item in override["services"]["media-control"]["secrets"]} == {"TURN_PASSWORD"}
    assert {item["target"] for item in override["services"]["mediamtx"]["secrets"]} == {"TURN_PASSWORD"}
