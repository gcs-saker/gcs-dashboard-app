import importlib.util
import os
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
RELEASE_GATE = REPO_ROOT / "scripts" / "ops" / "release_gate.py"
DEPLOY_SCRIPT = REPO_ROOT / "scripts" / "ops" / "safe_stateless_deploy.sh"
MQTT_PASSWORD_PREPARER = REPO_ROOT / "scripts" / "ops" / "prepare_mqtt_password_file.sh"
SERVER01_SMOKE = REPO_ROOT / "scripts" / "ops" / "server01_operational_smoke.sh"
SERVER01_SCOPE = REPO_ROOT / "docs" / "operations" / "GCS-Saker_Server01_managed_scope.md"


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


@pytest.mark.skipif(os.name == "nt", reason="POSIX ACL contract")
def test_private_file_accepts_only_the_named_runtime_read_acl(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    release_gate = load_release_gate()
    secret = tmp_path / "passwords.local"
    secret.write_text("health:$hash\n", encoding="utf-8")
    secret.chmod(0o640)
    monkeypatch.setattr(
        release_gate,
        "run",
        lambda *args, **kwargs: "user::rw-\nuser:1883:r--\ngroup::---\nmask::r--\nother::---",
    )

    release_gate.require_private_file(secret, allowed_read_uid="1883")


@pytest.mark.skipif(os.name == "nt", reason="POSIX ACL contract")
def test_private_file_rejects_any_additional_acl_principal(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    release_gate = load_release_gate()
    secret = tmp_path / "passwords.local"
    secret.write_text("health:$hash\n", encoding="utf-8")
    secret.chmod(0o640)
    monkeypatch.setattr(
        release_gate,
        "run",
        lambda *args, **kwargs: "user::rw-\nuser:1883:r--\nuser:2000:r--\ngroup::---\nmask::r--\nother::---",
    )

    with pytest.raises(RuntimeError, match="beyond owner and runtime uid"):
        release_gate.require_private_file(secret, allowed_read_uid="1883")


def test_deploy_verifies_every_rebuilt_container_revision() -> None:
    script = DEPLOY_SCRIPT.read_text(encoding="utf-8")

    assert 'export BACKEND_IMAGE="gcs-saker-backend:${SOURCE_COMMIT}"' in script
    assert 'for service in "${BUILD_SERVICES[@]}"' in script
    assert "org.opencontainers.image.revision" in script
    assert "release provenance mismatch" in script


def test_deploy_is_server01_only_and_rolls_back_with_previous_compose() -> None:
    script = DEPLOY_SCRIPT.read_text(encoding="utf-8")

    assert 'DEPLOYMENT_TARGET}" == "server01-production"' in script
    assert 'PROJECT_NAME}" == "gcs-saker-m2-production"' in script
    assert "com.docker.compose.project.config_files" in script
    assert "previous_compose=(docker compose" in script
    assert '"${previous_compose[@]}" up -d --no-deps "${STATELESS_SERVICES[@]}"' in script
    assert script.index('"${compose[@]}" build') < script.index("trap rollback ERR")
    assert "RELEASE_DIR must be outside the immutable source checkout" in script
    assert script.index("release_dir_real") < script.index("flyway_file=")


def test_deploy_guards_stateful_container_identity() -> None:
    script = DEPLOY_SCRIPT.read_text(encoding="utf-8")

    assert "stateful-containers.before.env" in script
    assert "stateful/external service was replaced" in script
    assert (
        "UNCHANGED_SERVICES=(edge mobile-publisher postgres-geo redis mqtt mediamtx turn-primary)"
        in script
    )


def test_deploy_keeps_public_edge_available_during_application_rollout() -> None:
    script = DEPLOY_SCRIPT.read_text(encoding="utf-8")

    assert "STATELESS_SERVICES=(backend auth-policy media-control dashboard)" in script
    assert "STATELESS_SERVICES=(backend auth-policy media-control dashboard edge)" not in script
    assert "127.0.0.1:80" in script


def test_deploy_updates_active_release_pointer_only_after_verification() -> None:
    script = DEPLOY_SCRIPT.read_text(encoding="utf-8")

    pointer_update = 'ln -sfn "${ROOT}" "${runtime_root}/current"'
    assert pointer_update in script
    assert script.index("stateful/external service was replaced") < script.index(pointer_update)
    assert script.rindex('check_public_tls.sh" "${PUBLIC_TLS_HOST}"') < script.index(pointer_update)
    assert script.index(pointer_update) < script.rindex("trap - ERR")


def test_mqtt_password_preparer_grants_only_runtime_read_acl() -> None:
    script = MQTT_PASSWORD_PREPARER.read_text(encoding="utf-8")

    assert 'chmod 600 "${password_file}"' in script
    assert 'setfacl -m "u:${mosquitto_uid}:r--"' in script
    assert 'grep -Fx "user:${mosquitto_uid}:r--"' in script


def test_server01_smoke_is_fail_closed_to_the_production_identity() -> None:
    script = SERVER01_SMOKE.read_text(encoding="utf-8")

    assert "gcs-saker-m2-production" in script
    assert "https://a4ai.121-159-26-245.sslip.io" in script
    assert "55122" not in script
    assert "staging" not in script.lower()
    assert "/healthz" in script and "/readyz" in script
    assert "org.opencontainers.image.revision" in script


def test_current_scope_excludes_server02_from_managed_operations() -> None:
    scope = SERVER01_SCOPE.read_text(encoding="utf-8")

    assert "only the production host" in scope
    assert "outside the managed scope" in scope
    assert "must not be probed, deployed, restarted" in scope


def test_scheduled_public_tls_probe_targets_server01_production_only() -> None:
    source = (REPO_ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")

    assert "scripts/ops/check_public_tls.sh a4ai.121-159-26-245.sslip.io 443" in source
    assert "staging-a4ai.121-159-26-245.sslip.io" not in source
