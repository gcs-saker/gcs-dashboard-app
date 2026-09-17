from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DOCKERFILE = ROOT / "deploy" / "mediamtx" / "Dockerfile.hardened"
CONFIG = ROOT / "deploy" / "mediamtx" / "mediamtx.closed-network.yml"


def test_mediamtx_source_and_builder_are_immutable() -> None:
    source = DOCKERFILE.read_text(encoding="utf-8")

    assert "FROM golang:1.26.6-alpine@sha256:" in source
    assert "ADD --checksum=sha256:" in source
    assert "mediamtx/archive/2c6727904fbf233615de74a6c54a9b94dbf6025d.tar.gz" in source


def test_mediamtx_runtime_patches_crypto_and_drops_privileges() -> None:
    source = DOCKERFILE.read_text(encoding="utf-8")

    assert "go get golang.org/x/crypto@v0.56.0" in source
    assert "FROM scratch" in source
    assert "USER 10001:10001" in source


def test_mediamtx_disables_unused_moq_listener() -> None:
    config = CONFIG.read_text(encoding="utf-8")

    assert "moq: false" in config
