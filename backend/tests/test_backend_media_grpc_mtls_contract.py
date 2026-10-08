from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def test_operational_compose_requires_backend_media_control_mtls() -> None:
    for path in (
        ROOT / "deploy" / "compose" / "compose.single-node.poc.yml",
        ROOT / "gcs-dashboard" / "docker-compose.yml",
    ):
        compose = path.read_text(encoding="utf-8")
        assert "MEDIA_CONTROL_GRPC_TARGET" in compose
        assert "MEDIA_CONTROL_GRPC_CA_FILE: /run/secrets/gcs-pki/ca.crt" in compose
        assert "MEDIA_CONTROL_GRPC_CERT_FILE: /run/secrets/gcs-pki/backend.crt" in compose
        assert "MEDIA_CONTROL_GRPC_KEY_FILE: /run/secrets/gcs-pki/backend.key" in compose
        assert 'MEDIA_CONTROL_GRPC_ALLOW_PLAINTEXT: "false"' in compose
        assert "MEDIA_CONTROL_GRPC_CERT_FILE: /run/secrets/gcs-pki/media-control.crt" in compose


def test_python_runtime_and_smoke_have_no_unconditional_insecure_channel() -> None:
    client = (ROOT / "backend" / "modules" / "media_control_grpc" / "client.py").read_text(encoding="utf-8")
    smoke = (ROOT / "scripts" / "smoke" / "grpc_runtime_smoke.py").read_text(encoding="utf-8")

    assert "grpc.secure_channel" in client
    assert "grpc.ssl_channel_credentials" in client
    assert "if settings.allow_plaintext" in client
    assert "if allow_plaintext" in smoke
    assert "grpc.secure_channel" in smoke
