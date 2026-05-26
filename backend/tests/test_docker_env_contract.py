from pathlib import Path
import subprocess

import yaml


REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPT = REPO_ROOT / "scripts" / "docker_env_check.py"
COMPOSE_FILE = REPO_ROOT / "gcs-dashboard" / "docker-compose.yml"
MEDIAMTX_CONFIG = REPO_ROOT / "gcs-dashboard" / "mediamtx.yml"
DASHBOARD_DOCKERFILE = REPO_ROOT / "gcs-dashboard" / "Dockerfile"
DASHBOARD_DOCKERIGNORE = REPO_ROOT / "gcs-dashboard" / ".dockerignore"
BACKEND_DOCKERIGNORE = REPO_ROOT / "backend" / ".dockerignore"
ENV_DOC = REPO_ROOT / "docs" / "operations" / "GCS-Saker_Docker_env_주입_가이드_v0.1.md"


def load_yaml(path: Path) -> dict:
    with path.open("r", encoding="utf-8") as file:
        return yaml.safe_load(file)


def test_docker_env_check_script_passes_static_contracts() -> None:
    result = subprocess.run(
        [str(SCRIPT)],
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    assert "Docker env contract check passed" in result.stdout


def test_compose_declares_env_injection_for_runtime_services() -> None:
    compose = load_yaml(COMPOSE_FILE)
    services = compose["services"]

    assert {"mysql", "mqtt", "backend", "mediamtx", "nginx"} <= set(services)
    assert services["backend"]["environment"]["DATABASE_URL"].startswith("${DATABASE_URL:")
    assert services["backend"]["environment"]["MQTT_HOST"] == "${MQTT_HOST:-mqtt}"
    assert services["backend"]["environment"]["MEDIAMTX_PUBLIC_WEBRTC_BASE_URL"].startswith("${MEDIAMTX_PUBLIC_WEBRTC_BASE_URL:")
    assert services["nginx"]["build"]["args"]["VITE_API_BASE_URL"] == "${VITE_API_BASE_URL:-/api}"
    assert services["nginx"]["build"]["args"]["VITE_HLS_BASE_URL"] == "${VITE_HLS_BASE_URL:-/hls}"
    assert services["nginx"]["build"]["args"]["VITE_LOCAL_WEBCAM_WHIP_URL"].startswith(
        "${VITE_LOCAL_WEBCAM_WHIP_URL:"
    )


def test_compose_keeps_mediamtx_management_ports_private_and_mounts_config_as_file() -> None:
    compose = load_yaml(COMPOSE_FILE)
    mediamtx = compose["services"]["mediamtx"]

    assert not any("9997" in port or "9998" in port for port in mediamtx["ports"])
    assert {
        "type": "bind",
        "source": "./mediamtx.yml",
        "target": "/mediamtx.yml",
        "read_only": True,
    } in mediamtx["volumes"]
    assert MEDIAMTX_CONFIG.is_file()


def test_dashboard_dockerfile_uses_vite_dist_and_build_args() -> None:
    dockerfile = DASHBOARD_DOCKERFILE.read_text(encoding="utf-8")

    assert "FROM node:22 AS builder" in dockerfile
    assert "ARG VITE_API_BASE_URL=/api" in dockerfile
    assert "ARG VITE_HLS_BASE_URL=/hls" in dockerfile
    assert "ARG VITE_LOCAL_WEBCAM_WHIP_URL=http://localhost:8889/raw/local/webcam/whip" in dockerfile
    assert "COPY --from=builder /app/dist /usr/share/nginx/html" in dockerfile
    assert "COPY nginx.conf /etc/nginx/nginx.conf" in dockerfile
    assert "EXPOSE 3000" in dockerfile


def test_dockerignore_excludes_local_dependency_and_env_artifacts() -> None:
    dashboard_ignore = DASHBOARD_DOCKERIGNORE.read_text(encoding="utf-8")
    backend_ignore = BACKEND_DOCKERIGNORE.read_text(encoding="utf-8")

    assert "node_modules" in dashboard_ignore
    assert "dist" in dashboard_ignore
    assert ".env.*" in dashboard_ignore
    assert ".venv/" in backend_ignore


def test_env_guide_documents_environment_split_and_recent_docker_failure() -> None:
    doc = ENV_DOC.read_text(encoding="utf-8")

    assert "local, staging, production" in doc
    assert "secret은 GitHub에 저장하지 않는다" in doc
    assert "MediaMTX `Exited (127)`" in doc
    assert "#112" in doc
