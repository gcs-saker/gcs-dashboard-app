from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DOCKERFILE = ROOT / "deploy" / "mosquitto" / "Dockerfile.hardened"
CONFIG = ROOT / "deploy" / "mosquitto" / "mosquitto.hardened.conf"


def test_mosquitto_runtime_is_pinned_and_applies_security_updates() -> None:
    source = DOCKERFILE.read_text(encoding="utf-8")

    assert "FROM eclipse-mosquitto@sha256:" in source
    assert "LABEL org.opencontainers.image.revision=$SOURCE_COMMIT" in source
    assert "RUN apk upgrade --no-cache" in source


def test_mosquitto_runtime_requires_tls13_client_certificates_and_bounded_payloads() -> None:
    source = CONFIG.read_text(encoding="utf-8")

    assert "listener 8883" in source
    assert "allow_anonymous false" in source
    assert "require_certificate true" in source
    assert "use_identity_as_username true" in source
    assert "tls_version tlsv1.3" in source
    assert "crlfile /run/secrets/gcs-pki/ca.crl" in source
    assert "message_size_limit 65536" in source
