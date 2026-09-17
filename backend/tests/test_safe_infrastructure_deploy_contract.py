from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPT = REPO_ROOT / "scripts" / "ops" / "safe_infrastructure_deploy.sh"


def script_source() -> str:
    return SCRIPT.read_text(encoding="utf-8")


def test_infrastructure_rollout_is_server01_only_and_sequential() -> None:
    source = script_source()

    assert 'DEPLOYMENT_TARGET}" == "server01-production"' in source
    assert "55122" not in source
    assert "SERVICES=(mqtt mediamtx turn-primary)" in source
    assert source.index("replace_service mqtt healthy") < source.index("replace_service mediamtx running")
    assert source.index("replace_service mediamtx running") < source.index("replace_service turn-primary healthy")


def test_infrastructure_rollout_requires_verified_backup_and_idle_media() -> None:
    source = script_source()

    assert "verify_signed_release.sh" in source
    assert "tar -tzf" in source
    assert "sha256sum" in source
    assert "infrastructure-backup.evidence" in source
    assert "ALLOW_MEDIA_SESSION_INTERRUPTION" in source
    assert "/v3/paths/list" in source


def test_each_replacement_has_a_service_specific_probe_and_rollback() -> None:
    source = script_source()

    assert "check_mqtt" in source
    assert "/v3/config/global/get" in source
    assert "turnutils_stunclient" in source
    assert "rollback_service" in source
    assert '"${compose[@]}" up -d --no-deps "${service}"' in source
    assert "docker tag" in source
    assert "org.opencontainers.image.revision" in source
    assert "release provenance mismatch" in source
