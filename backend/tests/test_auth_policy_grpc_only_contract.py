from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def test_single_node_policy_path_is_grpc_only_and_local_fallback_is_explicit() -> None:
    production = (ROOT / "deploy" / "compose" / "compose.single-node.poc.yml").read_text(encoding="utf-8")
    local = (ROOT / "gcs-dashboard" / "docker-compose.yml").read_text(encoding="utf-8")

    assert "AUTH_POLICY_GRPC_TARGET" in production
    assert "AUTH_POLICY_GRPC_CA_FILE: /run/secrets/gcs-pki/ca.crt" in production
    assert "AUTH_POLICY_ALLOW_HTTP_FALLBACK" not in production
    assert 'AUTH_POLICY_ALLOW_HTTP_FALLBACK: "true"' in local


def test_media_control_code_requires_explicit_http_fallback() -> None:
    runtime = (ROOT / "services" / "media-control" / "cmd" / "media-control" / "server_components.go").read_text(
        encoding="utf-8"
    )
    gateway = (ROOT / "services" / "media-control" / "cmd" / "media-control" / "gateway_dependencies.go").read_text(
        encoding="utf-8"
    )

    assert "if !config.authPolicyHTTPFallback" in runtime
    assert "if rpc == nil && !config.authPolicyHTTPFallback" in gateway
