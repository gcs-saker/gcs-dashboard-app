from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DOCKERFILE = ROOT / "deploy" / "mosquitto" / "Dockerfile.hardened"


def test_mosquitto_runtime_is_pinned_and_applies_security_updates() -> None:
    source = DOCKERFILE.read_text(encoding="utf-8")

    assert "FROM eclipse-mosquitto@sha256:" in source
    assert "RUN apk upgrade --no-cache" in source
