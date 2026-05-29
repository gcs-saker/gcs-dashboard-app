#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path
import re
import sys

import yaml

REPO_ROOT = Path(__file__).resolve().parents[1]
DASHBOARD_DIR = REPO_ROOT / "gcs-dashboard"
BACKEND_DIR = REPO_ROOT / "backend"
COMPOSE_FILE = DASHBOARD_DIR / "docker-compose.yml"
MEDIAMTX_CONFIG = DASHBOARD_DIR / "mediamtx.yml"
DASHBOARD_ENV_EXAMPLES = (
    DASHBOARD_DIR / ".env.example",
    DASHBOARD_DIR / ".env.staging.example",
    DASHBOARD_DIR / ".env.production.example",
)
BACKEND_ENV_EXAMPLE = BACKEND_DIR / ".env.example"
ENV_DOC = REPO_ROOT / "docs" / "operations" / "GCS-Saker_Docker_env_주입_가이드_v0.1.md"
DB_MODULE = BACKEND_DIR / "core" / "db.py"
MQTT_MODULE = BACKEND_DIR / "mqtt" / "client.py"
GITIGNORE = REPO_ROOT / ".gitignore"

REQUIRED_DASHBOARD_KEYS = {
    "COMPOSE_PROJECT_NAME",
    "LOCAL_BIND_ADDR",
    "MYSQL_ROOT_PASSWORD",
    "MYSQL_DATABASE",
    "MYSQL_USER",
    "MYSQL_PASSWORD",
    "DATABASE_URL",
    "AUTH_JWT_SECRET",
    "AUTH_REFRESH_TOKEN_EXPIRE_MINUTES",
    "AUTH_REFRESH_COOKIE_SECURE",
    "AUTH_REFRESH_COOKIE_SAMESITE",
    "BACKEND_CORS_ALLOW_ORIGINS",
    "BACKEND_HTTP_PORT",
    "DASHBOARD_HTTP_PORT",
    "PUBLIC_HTTPS_PORT",
    "NGINX_CERTS_DIR",
    "MQTT_HOST",
    "MQTT_PORT",
    "VITE_API_BASE_URL",
    "VITE_AUTH_API_BASE_URL",
    "VITE_STREAM_API_BASE_URL",
    "VITE_HLS_BASE_URL",
    "MEDIAMTX_PUBLIC_WEBRTC_BASE_URL",
    "MEDIAMTX_PUBLIC_HLS_BASE_URL",
    "MEDIAMTX_WEBRTC_SIGNALING_PORT",
    "MEDIAMTX_HLS_PORT",
    "WEBRTC_STUN_URL",
    "TURN_BIND_ADDR",
    "TURN_PORT",
    "TURN_REALM",
    "TURN_EXTERNAL_IP",
}

OPTIONAL_TURN_KEYS = {
    "WEBRTC_TURN_URL",
    "WEBRTC_TURN_USERNAME",
    "WEBRTC_TURN_PASSWORD",
}

SECRET_PATTERNS = (
    "root:1234",
    "165.229.",
    "tplinkdns",
)


def main() -> int:
    compose = load_yaml(COMPOSE_FILE)
    require(MEDIAMTX_CONFIG.is_file(), "gcs-dashboard/mediamtx.yml must be a file, not a directory")
    require_services(compose)
    require_env_files(compose)
    require_env_examples()
    require_no_hardcoded_runtime_secrets()
    require_doc()
    print("Docker env contract check passed")
    return 0


def load_yaml(path: Path) -> dict:
    with path.open("r", encoding="utf-8") as file:
        return yaml.safe_load(file)


def require_services(compose: dict) -> None:
    services = compose.get("services", {})
    for service_name in ("mysql", "mqtt", "backend", "mediamtx", "nginx", "edge"):
        require(service_name in services, f"missing compose service: {service_name}")
    require("9997" not in str(services["mediamtx"].get("ports", [])), "MediaMTX API port must not be published")
    require("9998" not in str(services["mediamtx"].get("ports", [])), "MediaMTX metrics port must not be published")
    require(
        "${PUBLIC_HTTPS_BIND_ADDR:-0.0.0.0}:${PUBLIC_HTTPS_PORT:-443}:443" in services["edge"].get("ports", []),
        "edge must publish 443",
    )
    for service_name in ("backend", "mediamtx", "nginx"):
        ports = str(services[service_name].get("ports", []))
        require("${LOCAL_BIND_ADDR:-127.0.0.1}:" in ports, f"{service_name} direct ports must bind locally by default")


def require_env_files(compose: dict) -> None:
    services = compose["services"]
    for service_name in ("mysql", "backend", "mediamtx", "nginx"):
        env_file = services[service_name].get("env_file")
        require(env_file, f"{service_name} must declare env_file")
        paths = {entry["path"] if isinstance(entry, dict) else entry for entry in env_file}
        require("./.env" in paths, f"{service_name} must read gcs-dashboard/.env")
        if service_name == "backend":
            require("../backend/.env" in paths, "backend must read backend/.env")


def require_env_examples() -> None:
    for env_path in DASHBOARD_ENV_EXAMPLES:
        content = env_path.read_text(encoding="utf-8")
        keys = set(re.findall(r"^([A-Z0-9_]+)=", content, flags=re.MULTILINE))
        missing = REQUIRED_DASHBOARD_KEYS - keys
        require(not missing, f"{env_path.name} is missing keys: {sorted(missing)}")
        for key in OPTIONAL_TURN_KEYS:
            require(
                re.search(rf"^#?\s*{key}=", content, flags=re.MULTILINE),
                f"{env_path.name} should document optional TURN key: {key}",
            )
        require("9997" not in content and "9998" not in content, f"{env_path.name} must not publish management ports")

    backend_content = BACKEND_ENV_EXAMPLE.read_text(encoding="utf-8")
    for key in (
        "DATABASE_URL",
        "AUTH_REFRESH_TOKEN_EXPIRE_MINUTES",
        "AUTH_REFRESH_COOKIE_SECURE",
        "AUTH_REFRESH_COOKIE_SAMESITE",
        "BACKEND_CORS_ALLOW_ORIGINS",
        "MQTT_HOST",
        "MQTT_PORT",
        "MEDIAMTX_PUBLIC_WEBRTC_BASE_URL",
        "MEDIAMTX_PUBLIC_HLS_BASE_URL",
    ):
        require(f"{key}=" in backend_content, f"backend/.env.example missing {key}")

    gitignore = GITIGNORE.read_text(encoding="utf-8")
    require(".env.*" in gitignore, ".gitignore must ignore concrete env variants")
    require("!.env.*.example" in gitignore, ".gitignore must allow env example variants")


def require_no_hardcoded_runtime_secrets() -> None:
    for path in (DB_MODULE, MQTT_MODULE, COMPOSE_FILE):
        content = path.read_text(encoding="utf-8")
        for pattern in SECRET_PATTERNS:
            require(pattern not in content, f"{path.relative_to(REPO_ROOT)} contains hardcoded runtime value: {pattern}")


def require_doc() -> None:
    doc = ENV_DOC.read_text(encoding="utf-8")
    for term in ("local", "staging", "production", "env_file", "mediamtx.yml", "#112"):
        require(term in doc, f"env guide missing term: {term}")


def require(condition: bool, message: str) -> None:
    if not condition:
        raise SystemExit(message)


if __name__ == "__main__":
    sys.exit(main())
