from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
MEDIA_CONTROL_SOURCE = REPO_ROOT / "services" / "media-control"
EDGE_CONFIGS = (
    REPO_ROOT / "deploy" / "nginx" / "single-node.poc.conf",
    REPO_ROOT / "deploy" / "nginx" / "gcs-saker.reverse-proxy.example.conf",
)


def test_public_edge_blocks_management_and_diagnostic_routes() -> None:
    for path in EDGE_CONFIGS:
        config = path.read_text(encoding="utf-8")
        for route in (
            "location /auth-policy/actuator/",
            "location /auth-policy/admin/api-docs/",
            "location /auth-policy/webjars/swagger-ui/",
            "location = /media-control/metrics",
        ):
            assert route in config
        assert config.count("return 404;") >= 6


def test_media_control_does_not_register_grpc_reflection() -> None:
    production_go = "\n".join(
        path.read_text(encoding="utf-8")
        for path in MEDIA_CONTROL_SOURCE.rglob("*.go")
        if not path.name.endswith("_test.go")
    )

    assert "grpc/reflection" not in production_go
    assert "reflection.Register" not in production_go
