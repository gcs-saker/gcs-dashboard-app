from pathlib import Path

import pytest
import yaml

ROOT = Path(__file__).resolve().parents[2]
DOCKERFILE = ROOT / "deploy" / "coturn" / "Dockerfile.hardened"


def test_coturn_runtime_is_pinned_and_applies_security_updates() -> None:
    source = DOCKERFILE.read_text(encoding="utf-8")

    assert "FROM coturn/coturn@sha256:" in source
    assert "LABEL org.opencontainers.image.revision=$SOURCE_COMMIT" in source
    assert "apt-get upgrade --yes --no-install-recommends" in source
    assert "rm -rf /var/lib/apt/lists/*" in source


@pytest.mark.parametrize("service_name", ["turn-primary", "turn-secondary"])
def test_turn_runtime_must_load_the_file_scoped_shared_secret(service_name: str) -> None:
    compose = yaml.safe_load((ROOT / "deploy/compose/compose.single-node.poc.yml").read_text(encoding="utf-8"))
    service = compose["services"][service_name]
    command = service["command"]

    assert service["entrypoint"] == ["/bin/sh", "/usr/local/bin/gcs-turnserver-entrypoint"]
    assert "--use-auth-secret" in command
    assert "-n" not in command, "coturn -n ignores the secret configuration created by the entrypoint"
    assert not any(option.startswith("--static-auth-secret") for option in command)
