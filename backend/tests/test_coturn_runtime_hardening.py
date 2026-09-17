from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DOCKERFILE = ROOT / "deploy" / "coturn" / "Dockerfile.hardened"


def test_coturn_runtime_is_pinned_and_applies_security_updates() -> None:
    source = DOCKERFILE.read_text(encoding="utf-8")

    assert "FROM coturn/coturn@sha256:" in source
    assert "LABEL org.opencontainers.image.revision=$SOURCE_COMMIT" in source
    assert "apt-get upgrade --yes --no-install-recommends" in source
    assert "rm -rf /var/lib/apt/lists/*" in source
