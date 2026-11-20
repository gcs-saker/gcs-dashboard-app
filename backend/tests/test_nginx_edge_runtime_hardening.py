from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DOCKERFILE = ROOT / "deploy/nginx/Dockerfile.hardened"


def test_edge_runtime_uses_patched_immutable_nginx() -> None:
    source = DOCKERFILE.read_text(encoding="utf-8")

    assert source.startswith("FROM ghcr.io/nginx/nginx-unprivileged:1.31.9-alpine@sha256:")
    assert "RUN apk upgrade --no-cache" in source
    assert "LABEL org.opencontainers.image.revision=$SOURCE_COMMIT" in source


def test_edge_runtime_returns_to_unprivileged_user() -> None:
    source = DOCKERFILE.read_text(encoding="utf-8")

    assert "USER root" in source
    assert source.rstrip().endswith("USER 101:101")
