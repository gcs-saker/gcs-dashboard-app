import subprocess
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPT = REPO_ROOT / "scripts" / "ops" / "health_readiness_check.py"
HEALTH_DOC = REPO_ROOT / "docs" / "operations" / "GCS-Saker_health_readiness_기준_v0.1.md"
BACKEND_DOCKERFILE = REPO_ROOT / "backend" / "Dockerfile"
BACKEND_PYPROJECT = REPO_ROOT / "backend" / "pyproject.toml"
BACKEND_PYTHON_VERSION = REPO_ROOT / "backend" / ".python-version"
MEDIAMTX_CONFIG = REPO_ROOT / "gcs-dashboard" / "mediamtx.yml"
EXPECTED_BACKEND_RUNTIME = (
    "python:3.12.13-slim-bookworm@sha256:d50fb7611f86d04a3b0471b46d7557818d88983fc3136726336b2a4c657aa30b"
)


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
    assert "MediaMTX 관리 API는 내부 스트림 discovery를 위해 활성화" in doc
    assert "외부 포트로 publish하지 않는다" in doc
    assert "#28" in doc
    assert "#102" in doc


def test_backend_dockerfile_uses_healthz_for_container_liveness():
    dockerfile = BACKEND_DOCKERFILE.read_text(encoding="utf-8")

    assert "HEALTHCHECK" in dockerfile
    assert "127.0.0.1:8001/healthz" in dockerfile


def test_backend_runtime_is_pinned_to_python_312():
    dockerfile = BACKEND_DOCKERFILE.read_text(encoding="utf-8")
    pyproject = BACKEND_PYPROJECT.read_text(encoding="utf-8")
    python_version = BACKEND_PYTHON_VERSION.read_text(encoding="utf-8").strip()

    assert dockerfile.count(f"FROM {EXPECTED_BACKEND_RUNTIME}") == 2
    assert 'requires-python = ">=3.12,<3.13"' in pyproject
    assert 'python_version = "3.12"' in pyproject
    assert python_version == "3.12"


def test_mediamtx_readiness_keeps_management_private_and_playback_auth_hooked():
    config = MEDIAMTX_CONFIG.read_text(encoding="utf-8")

    assert "api: true" in config
    assert "apiAddress: :9997" in config
    assert "authInternalUsers:" in config
    assert "authHTTPAddress: http://media-control:8081/v1/mediamtx/auth" in config
    assert "- action: read" not in config
    assert "- action: playback" not in config
    assert "172.16.0.0/12" in config
    assert "metrics: false" in config
    assert "metricsAddress: 127.0.0.1:9998" in config
    assert "hlsAddress: :8888" in config
    assert "webrtcAddress: :8889" in config
