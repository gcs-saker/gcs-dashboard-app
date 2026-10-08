from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def test_single_node_database_and_redis_transports_require_tls() -> None:
    compose = (ROOT / "deploy" / "compose" / "compose.single-node.poc.yml").read_text(encoding="utf-8")

    for value in (
        "ssl=on",
        "ssl_cert_file=/var/lib/postgresql/tls/server.crt",
        "ssl_key_file=/var/lib/postgresql/tls/server.key",
        "hba_file=/etc/postgresql/pg_hba.tls.conf",
        "sslmode=verify-full",
        "DATABASE_TLS_REQUIRED",
        "--tls-port",
        "--tls-cert-file",
        "--tls-key-file",
        "MEDIA_CONTROL_REDIS_CA_FILE",
        "MEDIA_CONTROL_REDIS_SERVER_NAME: redis",
        'SPRING_DATA_REDIS_SSL_ENABLED: "true"',
    ):
        assert value in compose
    assert "MEDIA_CONTROL_REDIS_ALLOW_PLAINTEXT" not in compose
    hba = (ROOT / "deploy" / "postgres" / "pg_hba.tls.conf").read_text(encoding="utf-8")
    assert "hostssl all all" in hba
    assert "host all all 0.0.0.0/0 reject" in hba


def test_internal_pki_issues_database_and_cache_server_identities() -> None:
    source = (ROOT / "scripts" / "ops" / "prepare_internal_pki.sh").read_text(encoding="utf-8")

    assert "issue_identity postgres postgres-geo serverAuth postgres-geo" in source
    assert "issue_identity redis redis serverAuth redis" in source
