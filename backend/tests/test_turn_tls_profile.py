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
    assert "--static-auth-secret" in compose


def test_internal_pki_issues_turn_server_identities() -> None:
    source = (ROOT / "scripts" / "ops" / "prepare_internal_pki.sh").read_text(encoding="utf-8")

    assert "issue_identity turn-primary turn-primary serverAuth turn-primary" in source
    assert "issue_identity turn-secondary turn-secondary serverAuth turn-secondary" in source
