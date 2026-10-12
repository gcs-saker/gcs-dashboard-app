import os
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DOCKERFILE = ROOT / "deploy" / "mosquitto" / "Dockerfile.hardened"
CONFIG = ROOT / "deploy" / "mosquitto" / "mosquitto.hardened.conf"
HEALTHCHECK = ROOT / "deploy" / "mosquitto" / "mqtt-healthcheck.sh"
COMPOSE = ROOT / "deploy" / "compose" / "compose.single-node.poc.yml"


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


def test_mqtt_healthcheck_reports_stable_failure_categories() -> None:
    compose = COMPOSE.read_text(encoding="utf-8")
    source = HEALTHCHECK.read_text(encoding="utf-8")

    assert '["CMD", "/usr/local/bin/gcs-mqtt-healthcheck"]' in compose
    assert "certificate_or_crl_expired" in source
    assert "certificate_revoked" in source
    assert "acl_or_identity_denied" in source
    assert "secure_probe_failed" in source
    assert 'echo "MQTT health failed: ${reason}"' in source
    assert 'echo "${output}"' not in source


def test_mqtt_healthcheck_classifies_expired_crl_without_raw_error(tmp_path: Path) -> None:
    fake_client = tmp_path / "mosquitto_sub"
    fake_client.write_text('#!/bin/sh\necho "ssl/tls alert certificate expired" >&2\nexit 1\n', encoding="utf-8")
    fake_client.chmod(0o700)
    environment = {**os.environ, "PATH": f"{tmp_path}{os.pathsep}{os.environ['PATH']}"}

    result = subprocess.run(["sh", str(HEALTHCHECK)], capture_output=True, text=True, env=environment, check=False)

    assert result.returncode == 1
    assert result.stderr.strip() == "MQTT health failed: certificate_or_crl_expired"
    assert "ssl/tls" not in result.stderr
