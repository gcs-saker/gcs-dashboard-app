from pathlib import Path
import subprocess


REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPT = REPO_ROOT / "scripts" / "health_readiness_check.py"
HEALTH_DOC = REPO_ROOT / "docs" / "operations" / "GCS-Saker_health_readiness_기준_v0.1.md"
BACKEND_DOCKERFILE = REPO_ROOT / "backend" / "Dockerfile"
MEDIAMTX_CONFIG = REPO_ROOT / "gcs-dashboard" / "mediamtx.yml"


def test_health_readiness_script_exists_and_has_valid_check_mode():
    assert SCRIPT.exists()

    result = subprocess.run(
        [str(SCRIPT), "--check"],
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    assert "Health/readiness static check passed" in result.stdout


def test_health_readiness_document_separates_health_ready_and_metrics_roles():
    doc = HEALTH_DOC.read_text(encoding="utf-8")

    assert "/healthz" in doc
    assert "/readyz" in doc
    assert "/metrics" in doc
    assert "민감 정보를 노출하지 않는다" in doc
    assert "MediaMTX 관리 API와 metrics는 기본적으로 비활성화" in doc
    assert "#28" in doc
    assert "#102" in doc


def test_backend_dockerfile_uses_healthz_for_container_liveness():
    dockerfile = BACKEND_DOCKERFILE.read_text(encoding="utf-8")

    assert "HEALTHCHECK" in dockerfile
    assert "127.0.0.1:8001/healthz" in dockerfile


def test_mediamtx_readiness_keeps_management_private_and_playback_public():
    config = MEDIAMTX_CONFIG.read_text(encoding="utf-8")

    assert "api: false" in config
    assert "apiAddress: 127.0.0.1:9997" in config
    assert "metrics: false" in config
    assert "metricsAddress: 127.0.0.1:9998" in config
    assert "hlsAddress: :8888" in config
    assert "webrtcAddress: :8889" in config
