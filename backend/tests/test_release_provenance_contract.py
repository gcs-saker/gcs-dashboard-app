import importlib.util
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
RELEASE_GATE = REPO_ROOT / "scripts" / "ops" / "release_gate.py"
DEPLOY_SCRIPT = REPO_ROOT / "scripts" / "ops" / "safe_stateless_deploy.sh"


def load_release_gate():
    spec = importlib.util.spec_from_file_location("release_gate", RELEASE_GATE)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_application_images_must_match_the_exact_release_commit(monkeypatch: pytest.MonkeyPatch) -> None:
    release_gate = load_release_gate()
    commit = "a" * 40
    for variable, image in {
        "BACKEND_IMAGE": "gcs-saker-backend",
        "AUTH_POLICY_IMAGE": "gcs-saker-auth-policy",
        "MEDIA_CONTROL_IMAGE": "gcs-saker-media-control",
        "DASHBOARD_IMAGE": "gcs-saker-dashboard",
    }.items():
        monkeypatch.setenv(variable, f"{image}:{commit}")

    inventory = release_gate.application_image_inventory(commit)

    assert set(inventory) == {"backend", "auth-policy", "media-control", "dashboard"}


def test_mutable_application_image_tag_is_rejected(monkeypatch: pytest.MonkeyPatch) -> None:
    release_gate = load_release_gate()
    commit = "b" * 40
    for variable in ["BACKEND_IMAGE", "AUTH_POLICY_IMAGE", "MEDIA_CONTROL_IMAGE", "DASHBOARD_IMAGE"]:
        monkeypatch.setenv(variable, f"example/{variable.lower()}:latest")

    with pytest.raises(RuntimeError, match="exact source commit tag"):
        release_gate.application_image_inventory(commit)


def test_deploy_verifies_every_rebuilt_container_revision() -> None:
    script = DEPLOY_SCRIPT.read_text(encoding="utf-8")

    assert 'export BACKEND_IMAGE="gcs-saker-backend:${SOURCE_COMMIT}"' in script
    assert 'for service in "${BUILD_SERVICES[@]}"' in script
    assert "org.opencontainers.image.revision" in script
    assert "release provenance mismatch" in script
