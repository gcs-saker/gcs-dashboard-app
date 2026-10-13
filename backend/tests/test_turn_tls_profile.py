from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def test_turn_profile_keeps_udp_and_adds_tls_fallback() -> None:
    compose = (ROOT / "deploy" / "compose" / "compose.single-node.poc.yml").read_text(encoding="utf-8")

    for value in (
        "--listening-port=3478",
        "--tls-listening-port=5349",
        "--cert=/run/secrets/gcs-pki/turn-primary.crt",
        "--pkey=/run/secrets/gcs-pki/turn-primary.key",
        "turns:turn-primary:5349?transport=tcp",
        "TURN_PRIMARY_TLS_HOST_PORT",
    ):
        assert value in compose
    assert "--use-auth-secret" in compose
    assert "--static-auth-secret" not in compose
    entrypoint = (ROOT / "deploy/coturn/turnserver-entrypoint.sh").read_text(encoding="utf-8")
    assert "static-auth-secret=%s" in entrypoint
    assert "/run/secrets/TURN_SHARED_SECRET" in entrypoint


def test_internal_pki_issues_turn_server_identities() -> None:
    source = (ROOT / "scripts" / "ops" / "prepare_internal_pki.sh").read_text(encoding="utf-8")

    assert "issue_identity turn-primary turn-primary serverAuth turn-primary" in source
    assert "issue_identity turn-secondary turn-secondary serverAuth turn-secondary" in source


def test_turn_healthcheck_cannot_convert_probe_failure_to_success() -> None:
    compose = (ROOT / "deploy" / "compose" / "compose.single-node.poc.yml").read_text(encoding="utf-8")
    healthcheck = (ROOT / "deploy" / "coturn" / "turn-healthcheck.sh").read_text(encoding="utf-8")

    assert compose.count('["CMD", "/usr/local/bin/gcs-turn-healthcheck"]') == 2
    assert "turnutils_stunclient" in healthcheck
    assert "-t 1500" in healthcheck
    assert "|| exit 0" not in healthcheck
    assert "|| exit 0" not in compose
