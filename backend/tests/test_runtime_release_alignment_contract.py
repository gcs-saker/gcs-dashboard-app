import os
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
ALIGNMENT = ROOT / "scripts/ops/verify_runtime_release_alignment.sh"
INFRA_DEPLOY = ROOT / "scripts/ops/safe_infrastructure_deploy.sh"
STATELESS_DEPLOY = ROOT / "scripts/ops/safe_stateless_deploy.sh"


def test_alignment_requires_every_owned_runtime_image() -> None:
    source = ALIGNMENT.read_text(encoding="utf-8")

    for service in ("backend", "auth-policy", "media-control", "dashboard", "mqtt", "mediamtx", "turn-primary"):
        assert service in source
    assert "org.opencontainers.image.revision" in source
    assert "docker image inspect" in source
    assert "revision mismatch" in source
    assert "image mismatch" in source


def test_infrastructure_is_only_a_stage_until_stateless_cutover_aligns_all() -> None:
    infrastructure = INFRA_DEPLOY.read_text(encoding="utf-8")
    stateless = STATELESS_DEPLOY.read_text(encoding="utf-8")

    assert 'verify_runtime_release_alignment.sh" infrastructure' in infrastructure
    assert "complete=false" in infrastructure
    assert "full runtime release is not complete" in infrastructure
    assert stateless.index('verify_runtime_release_alignment.sh" infrastructure') < stateless.index(
        "official_replace_started=1"
    )
    assert stateless.index('verify_runtime_release_alignment.sh" all') < stateless.index('ln -sfn "${ROOT}"')


def test_alignment_rejects_a_running_image_outside_the_manifest(tmp_path: Path) -> None:
    if shutil.which("bash") is None:
        pytest.skip("bash is required")
    fake_docker = tmp_path / "docker"
    fake_docker.write_text(
        """#!/bin/sh
last=""
for argument in "$@"; do last="$argument"; done
if [ "$1" = compose ]; then echo "cid-$last"; exit 0; fi
if [ "$1" = image ]; then echo "id-$last"; exit 0; fi
service="${last#cid-}"
case "$3" in
  *revision*) echo "$TEST_COMMIT" ;;
  *) [ "$service" = "${FAKE_MISMATCH_SERVICE:-}" ] && echo "id-wrong" || echo "id-$service" ;;
esac
""",
        encoding="utf-8",
    )
    fake_docker.chmod(0o700)
    env_file = tmp_path / "runtime.env"
    env_file.write_text("TEST_ONLY=1\n", encoding="utf-8")
    commit = "a" * 40
    environment = {**os.environ, "PATH": f"{tmp_path}{os.pathsep}{os.environ['PATH']}", "TEST_COMMIT": commit}
    environment.update(
        {"COMPOSE_FILE": str(ROOT / "deploy/compose/compose.single-node.poc.yml"), "ENV_FILE": str(env_file)}
    )
    environment.update({"COMPOSE_PROJECT_NAME": "gcs-saker-m2-production", "SOURCE_COMMIT": commit})
    for name in ("BACKEND", "AUTH_POLICY", "MEDIA_CONTROL", "DASHBOARD", "MQTT", "MEDIAMTX"):
        environment[f"{name}_IMAGE"] = name.lower().replace("_", "-")
    environment["COTURN_IMAGE"] = "turn-primary"

    passed = subprocess.run(["bash", str(ALIGNMENT), "all"], env=environment, capture_output=True, text=True)
    environment["FAKE_MISMATCH_SERVICE"] = "mqtt"
    failed = subprocess.run(["bash", str(ALIGNMENT), "all"], env=environment, capture_output=True, text=True)

    assert passed.returncode == 0
    assert failed.returncode == 1
    assert failed.stderr.strip() == "release alignment failed: mqtt image mismatch"
