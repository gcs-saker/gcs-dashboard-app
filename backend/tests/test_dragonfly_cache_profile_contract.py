from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path
import importlib.util


REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPT = REPO_ROOT / "scripts" / "dragonfly_profile_smoke.py"
MATRIX = REPO_ROOT / "docs" / "architecture" / "GCS-Saker_v2_completion_matrix.yml"
STATUS = REPO_ROOT / "docs" / "architecture" / "GCS-Saker_runtime_stack_status.yml"


def dragonfly_check_payload() -> dict:
    result = subprocess.run(
        [sys.executable, str(SCRIPT), "--check"],
        check=False,
        capture_output=True,
        text=True,
        cwd=REPO_ROOT,
    )

    assert result.returncode == 0, result.stderr
    return json.loads(result.stdout)


def test_dragonfly_profile_contract_covers_auth_media_and_cache_failure_paths() -> None:
    payload = dragonfly_check_payload()

    assert payload["schemaVersion"] == "dragonfly-profile-smoke-v1"
    assert payload["status"] == "profile-runtime-contract"
    assert {profile["name"] for profile in payload["profiles"]} == {"redis", "dragonfly"}
    assert payload["redisCommandSubset"] == ["AUTH", "PING", "SETEX", "GET", "GETDEL", "TTL", "DEL"]
    assert any("principal cache" in contract for contract in payload["cacheKeyContracts"])
    assert any("refresh session" in contract for contract in payload["cacheKeyContracts"])
    assert any("ICE server list" in contract for contract in payload["cacheKeyContracts"])
    assert any("stream list and stream presence" in contract for contract in payload["cacheKeyContracts"])
    assert any("falls back to upstream registry" in behavior for behavior in payload["degradedBehavior"])
    assert any("readiness" in behavior for behavior in payload["degradedBehavior"])


def test_dragonfly_profile_records_license_and_non_default_promotion_gate() -> None:
    payload = dragonfly_check_payload()

    assert payload["license"]["dragonfly"] == "BSL 1.1"
    assert payload["license"]["source"].startswith("https://www.dragonflydb.io/docs/about/license")
    assert "not offered as a managed" in payload["license"]["productionUseNote"]
    assert "profile remains optional" in "\n".join(payload["runtimeChecks"])
    assert "Promote to active only after Redis and DragonFly runtime smoke results are equivalent" in payload["promotionGate"]


def test_dragonfly_smoke_allows_server_env_without_explicit_dragonfly_image(tmp_path: Path) -> None:
    server_like_env = tmp_path / ".env.single-node"
    server_like_env.write_text(
        "\n".join(
            [
                "COMPOSE_PROJECT_NAME=gcs-saker-test",
                "REDIS_PASSWORD=change-me-redis",
            ]
        ),
        encoding="utf-8",
    )

    result = subprocess.run(
        [sys.executable, str(SCRIPT), "--check", "--env-file", str(server_like_env)],
        check=False,
        capture_output=True,
        text=True,
        cwd=REPO_ROOT,
    )

    assert result.returncode == 0, result.stderr
    payload = json.loads(result.stdout)
    assert payload["schemaVersion"] == "dragonfly-profile-smoke-v1"
    assert any(profile["name"] == "dragonfly" for profile in payload["profiles"])
    spec = importlib.util.spec_from_file_location("dragonfly_profile_smoke", SCRIPT)
    assert spec is not None
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    assert (
        module.read_env_value(
            server_like_env,
            "DRAGONFLY_IMAGE",
            default=module.DEFAULT_DRAGONFLY_IMAGE,
        )
        == module.DEFAULT_DRAGONFLY_IMAGE
    )


def test_dragonfly_completion_matrix_no_longer_blocks_release_but_keeps_profile_not_default() -> None:
    matrix = MATRIX.read_text(encoding="utf-8")
    status = STATUS.read_text(encoding="utf-8")

    assert "issue: 415" in matrix
    assert "currentState: runtime-validated-profile" in matrix
    assert "Redis/DragonFly 양쪽 auth/session/ICE/stream cache smoke 비교" not in matrix
    assert "license/image tag/release note 기록" not in matrix
    assert "dragonflyCacheProfile:" in status
    assert "status: profile" in status
    assert "profile remains optional" in status
