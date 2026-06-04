from pathlib import Path
import subprocess
import sys

import yaml


REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPT = REPO_ROOT / "scripts" / "docker_env_check.py"
COMPOSE_FILE = REPO_ROOT / "gcs-dashboard" / "docker-compose.yml"
SINGLE_NODE_COMPOSE_FILE = REPO_ROOT / "deploy" / "compose" / "compose.single-node.poc.yml"
EDGE_HTTPS_OVERRIDE_FILE = REPO_ROOT / "deploy" / "compose" / "compose.edge-https.override.yml"
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
        [sys.executable, str(SCRIPT)],
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    assert "Docker env contract check passed" in result.stdout


def test_compose_declares_env_injection_for_runtime_services() -> None:
    compose = load_yaml(COMPOSE_FILE)
    services = compose["services"]

    assert {"mysql", "mqtt", "backend", "mediamtx", "turn", "nginx", "edge"} <= set(services)
    assert services["backend"]["environment"]["DATABASE_URL"].startswith("${DATABASE_URL:")
    assert services["backend"]["environment"]["AUTH_JWT_SECRET"].startswith("${AUTH_JWT_SECRET:")
    assert services["backend"]["environment"]["AUTH_REFRESH_TOKEN_EXPIRE_MINUTES"] == (
        "${AUTH_REFRESH_TOKEN_EXPIRE_MINUTES:-10080}"
    )
    assert services["backend"]["environment"]["AUTH_REFRESH_COOKIE_SECURE"] == "${AUTH_REFRESH_COOKIE_SECURE:-false}"
    assert services["backend"]["environment"]["AUTH_REFRESH_COOKIE_SAMESITE"] == "${AUTH_REFRESH_COOKIE_SAMESITE:-lax}"
    assert services["backend"]["environment"]["MQTT_HOST"] == "${MQTT_HOST:-mqtt}"
    assert services["backend"]["environment"]["MEDIAMTX_PUBLIC_WEBRTC_BASE_URL"].startswith("${MEDIAMTX_PUBLIC_WEBRTC_BASE_URL:")
    assert services["backend"]["environment"]["WEBRTC_STUN_URL"] == (
        "${WEBRTC_STUN_URL:-stun:stun.l.google.com:19302}"
    )
    assert services["backend"]["environment"]["WEBRTC_TURN_URL"] == "${WEBRTC_TURN_URL:-}"
    assert services["nginx"]["build"]["args"]["VITE_API_BASE_URL"] == "${VITE_API_BASE_URL:-/api}"
    assert services["nginx"]["build"]["args"]["VITE_IDENTITY_API_BASE_URL"] == (
        "${VITE_AUTH_API_BASE_URL:-/auth-policy/auth}"
    )
    assert services["nginx"]["build"]["args"]["VITE_STREAM_API_BASE_URL"] == "${VITE_STREAM_API_BASE_URL:-/api}"
    assert services["nginx"]["build"]["args"]["VITE_HLS_BASE_URL"] == "${VITE_HLS_BASE_URL:-/hls}"
    assert services["nginx"]["build"]["args"]["VITE_LOCAL_WEBCAM_WHIP_URL"].startswith(
        "${VITE_LOCAL_WEBCAM_WHIP_URL:"
    )
    assert services["nginx"]["build"]["args"]["VITE_WEBRTC_STUN_URL"] == (
        "${VITE_WEBRTC_STUN_URL:-stun:stun.l.google.com:19302}"
    )
    assert services["nginx"]["build"]["args"]["VITE_MAP_PROVIDER"] == "${VITE_MAP_PROVIDER:-openfreemap}"
    assert services["nginx"]["build"]["args"]["VITE_MAP_STYLE_URL"] == (
        "${VITE_MAP_STYLE_URL:-https://tiles.openfreemap.org/styles/liberty}"
    )


def test_single_node_mqtt_healthcheck_uses_container_available_probe() -> None:
    compose = load_yaml(SINGLE_NODE_COMPOSE_FILE)
    mqtt_healthcheck = compose["services"]["mqtt"]["healthcheck"]["test"]

    assert mqtt_healthcheck == ["CMD-SHELL", "nc -z 127.0.0.1 1883"]
    assert "/dev/tcp" not in " ".join(mqtt_healthcheck)


def test_single_node_dashboard_can_cut_over_stream_api_to_go_media_control() -> None:
    compose = load_yaml(SINGLE_NODE_COMPOSE_FILE)
    services = compose["services"]

    assert services["dashboard"]["build"]["args"]["VITE_IDENTITY_API_BASE_URL"] == (
        "${VITE_AUTH_API_BASE_URL:-/auth-policy/auth}"
    )
    assert services["dashboard"]["build"]["args"]["VITE_STREAM_API_BASE_URL"] == (
        "${VITE_STREAM_API_BASE_URL:-/media-control}"
    )
    assert services["media-control"]["environment"]["AUTH_POLICY_BASE_URL"] == (
        "${AUTH_POLICY_BASE_URL:-http://auth-policy:8080}"
    )
    assert services["auth-policy"]["environment"]["AUTH_POLICY_SIGNUP_INVITES"] == (
        "${AUTH_POLICY_SIGNUP_INVITES:-A4AI01:1:co-a}"
    )
    assert services["media-control"]["environment"]["MEDIA_CONTROL_DEFAULT_PUBLISHER_GROUP_ID"] == (
        "${MEDIA_CONTROL_DEFAULT_PUBLISHER_GROUP_ID:-co-a}"
    )
    assert services["media-control"]["environment"]["MEDIA_CONTROL_STREAM_GROUP_MAP"] == (
        "${MEDIA_CONTROL_STREAM_GROUP_MAP:-raw/sample/front=co-a,raw/local/webcam=co-a}"
    )
    assert services["media-control"]["environment"]["MEDIA_CONTROL_PUBLIC_WEBRTC_BASE_URL"] == (
        "${MEDIA_CONTROL_PUBLIC_WEBRTC_BASE_URL:-http://localhost:8080/webrtc}"
    )
    assert services["media-control"]["environment"]["MEDIA_CONTROL_PUBLIC_HLS_BASE_URL"] == (
        "${MEDIA_CONTROL_PUBLIC_HLS_BASE_URL:-http://localhost:8080/hls}"
    )
    assert services["media-control"]["environment"]["MEDIA_CONTROL_STUN_URL"] == (
        "${MEDIA_CONTROL_STUN_URL:-stun:stun.l.google.com:19302}"
    )
    assert services["media-control"]["environment"]["MEDIA_CONTROL_TURN_PRIMARY_URL"] == (
        "${MEDIA_CONTROL_TURN_PRIMARY_URL:-turn:localhost:3478?transport=udp}"
    )
    assert services["media-control"]["environment"]["MEDIA_CONTROL_TURN_SECONDARY_URL"] == (
        "${MEDIA_CONTROL_TURN_SECONDARY_URL:-turn:localhost:3479?transport=udp}"
    )


def test_single_node_keeps_management_ports_local_but_allows_webrtc_ice_public_bind_override() -> None:
    compose = load_yaml(SINGLE_NODE_COMPOSE_FILE)
    services = compose["services"]

    mediamtx_ports = services["mediamtx"]["ports"]
    turn_primary_ports = services["turn-primary"]["ports"]

    assert "${LOCAL_BIND_ADDR:-127.0.0.1}:${MEDIAMTX_RTSP_PORT:-8554}:8554/tcp" in mediamtx_ports
    assert "${LOCAL_BIND_ADDR:-127.0.0.1}:${MEDIAMTX_RTMP_PORT:-1935}:1935/tcp" in mediamtx_ports
    assert "${LOCAL_BIND_ADDR:-127.0.0.1}:${MEDIAMTX_SRT_PORT:-8890}:8890/udp" in mediamtx_ports
    assert "${MEDIAMTX_ICE_BIND_ADDR:-127.0.0.1}:${MEDIAMTX_WEBRTC_ICE_UDP_PORT:-8189}:8189/udp" in mediamtx_ports
    assert "${MEDIAMTX_ICE_BIND_ADDR:-127.0.0.1}:${MEDIAMTX_WEBRTC_ICE_TCP_PORT:-8189}:8189/tcp" in mediamtx_ports
    assert "${TURN_PUBLIC_BIND_ADDR:-127.0.0.1}:${TURN_PRIMARY_HOST_PORT:-3478}:3478/tcp" in turn_primary_ports
    assert "${TURN_PUBLIC_BIND_ADDR:-127.0.0.1}:${TURN_PRIMARY_HOST_PORT:-3478}:3478/udp" in turn_primary_ports
    assert (
        "${TURN_PUBLIC_BIND_ADDR:-127.0.0.1}:${TURN_PRIMARY_RELAY_HOST_MIN_PORT:-49160}-"
        "${TURN_PRIMARY_RELAY_HOST_MAX_PORT:-49180}:49160-49180/udp"
    ) in turn_primary_ports


def test_single_node_edge_depends_on_active_cutover_services() -> None:
    compose = load_yaml(SINGLE_NODE_COMPOSE_FILE)
    edge_depends_on = compose["services"]["edge"]["depends_on"]

    assert edge_depends_on["auth-policy"]["condition"] == "service_healthy"
    assert edge_depends_on["dashboard"]["condition"] == "service_healthy"
    assert edge_depends_on["media-control"]["condition"] == "service_started"
    assert edge_depends_on["mediamtx"]["condition"] == "service_started"
    assert "backend" not in edge_depends_on


def test_https_edge_healthcheck_allows_temporary_self_signed_certificate() -> None:
    override = load_yaml(EDGE_HTTPS_OVERRIDE_FILE)
    healthcheck = override["services"]["edge"]["healthcheck"]["test"]

    assert healthcheck == [
        "CMD-SHELL",
        "wget --no-check-certificate -q -O- https://127.0.0.1/healthz >/dev/null",
    ]


def test_compose_publishes_only_edge_https_by_default_for_external_ingress() -> None:
    compose = load_yaml(COMPOSE_FILE)
    services = compose["services"]

    assert "${PUBLIC_HTTPS_BIND_ADDR:-0.0.0.0}:${PUBLIC_HTTPS_PORT:-443}:443" in services["edge"]["ports"]
    assert "${PUBLIC_HTTP_BIND_ADDR:-127.0.0.1}:${PUBLIC_HTTP_PORT:-80}:80" in services["edge"]["ports"]
    assert "${LOCAL_BIND_ADDR:-127.0.0.1}:${DASHBOARD_HTTP_PORT:-3000}:3000" in services["nginx"]["ports"]
    assert "${LOCAL_BIND_ADDR:-127.0.0.1}:${BACKEND_HTTP_PORT:-8001}:8001" in services["backend"]["ports"]
    assert "${LOCAL_BIND_ADDR:-127.0.0.1}:${MEDIAMTX_HLS_PORT:-8888}:8888/tcp" in services["mediamtx"]["ports"]
    assert "${LOCAL_BIND_ADDR:-127.0.0.1}:${MEDIAMTX_WEBRTC_SIGNALING_PORT:-8889}:8889/tcp" in services["mediamtx"]["ports"]


def test_edge_reverse_proxy_mounts_tls_material_from_private_env_path() -> None:
    compose = load_yaml(COMPOSE_FILE)
    edge = compose["services"]["edge"]

    assert edge["image"] == "nginx:1.29-alpine"
    assert {
        "type": "bind",
        "source": "../deploy/nginx/gcs-saker.reverse-proxy.example.conf",
        "target": "/etc/nginx/nginx.conf",
        "read_only": True,
    } in edge["volumes"]
    assert {
        "type": "bind",
        "source": "${NGINX_CERTS_DIR:-./certs}",
        "target": "/etc/nginx/certs",
        "read_only": True,
    } in edge["volumes"]


def test_compose_keeps_mediamtx_management_ports_private_and_mounts_config_as_file() -> None:
    compose = load_yaml(COMPOSE_FILE)
    mediamtx = compose["services"]["mediamtx"]

    assert mediamtx["image"] == "${MEDIAMTX_IMAGE:-bluenviron/mediamtx:1.15.3}"
    assert not any("9997" in port or "9998" in port for port in mediamtx["ports"])
    assert {
        "type": "bind",
        "source": "./mediamtx.yml",
        "target": "/mediamtx.yml",
        "read_only": True,
    } in mediamtx["volumes"]
    assert MEDIAMTX_CONFIG.is_file()


def test_compose_declares_turn_service_as_opt_in_profile() -> None:
    compose = load_yaml(COMPOSE_FILE)
    turn = compose["services"]["turn"]

    assert turn["profiles"] == ["turn"]
    assert turn["image"] == "${COTURN_IMAGE:-coturn/coturn:4.6.3}"
    assert "${TURN_BIND_ADDR:-0.0.0.0}:${TURN_PORT:-3478}:3478/tcp" in turn["ports"]
    assert "${TURN_BIND_ADDR:-0.0.0.0}:${TURN_PORT:-3478}:3478/udp" in turn["ports"]
    assert "${TURN_BIND_ADDR:-0.0.0.0}:49160-49200:49160-49200/udp" in turn["ports"]
    assert "--min-port=49160" in turn["command"]
    assert "--max-port=49200" in turn["command"]
    assert "--lt-cred-mech" in turn["command"]
    assert "--user=${WEBRTC_TURN_USERNAME:-gcs-turn}:${WEBRTC_TURN_PASSWORD:-replace-with-secret-outside-git}" in turn["command"]
    assert "--no-multicast-peers" not in turn["command"]


def test_single_node_turn_services_use_coturn_supported_runtime_flags() -> None:
    compose = load_yaml(SINGLE_NODE_COMPOSE_FILE)

    for service_name in ("turn-primary", "turn-secondary"):
        command = compose["services"][service_name]["command"]
        assert "--lt-cred-mech" in command
        assert "--no-cli" in command
        assert "--no-multicast-peers" not in command


def test_dashboard_dockerfile_uses_vite_dist_and_build_args() -> None:
    dockerfile = DASHBOARD_DOCKERFILE.read_text(encoding="utf-8")

    assert "FROM node:22 AS builder" in dockerfile
    assert "ARG VITE_API_BASE_URL=/api" in dockerfile
    assert "ARG VITE_IDENTITY_API_BASE_URL=/auth-policy/auth" in dockerfile
    assert "RUN VITE_AUTH_API_BASE_URL=$VITE_IDENTITY_API_BASE_URL npm run build" in dockerfile
    assert "ARG VITE_STREAM_API_BASE_URL=/api" in dockerfile
    assert "ARG VITE_HLS_BASE_URL=/hls" in dockerfile
    assert "ARG VITE_LOCAL_WEBCAM_WHIP_URL=https://localhost/webrtc/raw/local/webcam/whip" in dockerfile
    assert "ARG VITE_WEBRTC_STUN_URL=stun:stun.l.google.com:19302" in dockerfile
    assert "ARG VITE_MAP_PROVIDER=openfreemap" in dockerfile
    assert "ARG VITE_MAP_STYLE_URL=https://tiles.openfreemap.org/styles/liberty" in dockerfile
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
    assert "443" in doc
    assert "NGINX_CERTS_DIR" in doc
    assert "#112" in doc


def test_dashboard_nginx_defers_mediamtx_dns_resolution_until_request_time() -> None:
    config = (REPO_ROOT / "gcs-dashboard" / "nginx.conf").read_text(encoding="utf-8")

    assert "resolver 127.0.0.11 valid=10s ipv6=off;" in config
    assert "set $mediamtx_hls_host mediamtx;" in config
    assert "rewrite ^/hls/(.*)$ /$1 break;" in config
    assert "proxy_pass http://$mediamtx_hls_host:8888;" in config
    assert "proxy_pass http://mediamtx:8888/" not in config
