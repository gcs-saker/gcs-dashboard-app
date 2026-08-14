import shutil
import subprocess
import sys
from pathlib import Path

import yaml

REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPT = REPO_ROOT / "scripts" / "gates" / "docker_env_check.py"
COMPOSE_FILE = REPO_ROOT / "gcs-dashboard" / "docker-compose.yml"
SINGLE_NODE_COMPOSE_FILE = REPO_ROOT / "deploy" / "compose" / "compose.single-node.poc.yml"
EDGE_HTTPS_OVERRIDE_FILE = REPO_ROOT / "deploy" / "compose" / "compose.edge-https.override.yml"
DRAGONFLY_OVERRIDE_FILE = REPO_ROOT / "deploy" / "compose" / "compose.dragonfly.override.yml"
MEDIAMTX_CONFIG = REPO_ROOT / "gcs-dashboard" / "mediamtx.yml"
DASHBOARD_DOCKERFILE = REPO_ROOT / "gcs-dashboard" / "Dockerfile"
DASHBOARD_DOCKERIGNORE = REPO_ROOT / "gcs-dashboard" / ".dockerignore"
BACKEND_DOCKERIGNORE = REPO_ROOT / "backend" / ".dockerignore"
MEDIA_CONTROL_DOCKERFILE = REPO_ROOT / "services" / "media-control" / "Dockerfile"
ENV_DOC = REPO_ROOT / "docs" / "operations" / "GCS-Saker_Docker_env_주입_가이드_v0.1.md"
LOCAL_MQTT_NO_AUTH_OVERRIDE = REPO_ROOT / "gcs-dashboard" / "docker-compose.mqtt-no-auth.profile.yml"
AUTH_POLICY_APPLICATION_CONFIG = (
    REPO_ROOT / "services" / "auth-policy" / "src" / "main" / "resources" / "application.yml"
)


def load_yaml(path: Path) -> dict:
    with path.open("r", encoding="utf-8") as file:
        return yaml.safe_load(file)


def test_auth_policy_disables_open_session_in_view() -> None:
    config = load_yaml(AUTH_POLICY_APPLICATION_CONFIG)

    assert config["spring"]["jpa"]["open-in-view"] is False


def test_docker_env_check_script_passes_static_contracts() -> None:
    result = subprocess.run(
        [sys.executable, str(SCRIPT)],
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    assert "Docker env contract check passed" in result.stdout


def test_single_node_active_runtime_compose_model_is_valid_without_future_profile() -> None:
    if shutil.which("docker") is None:
        import pytest

        pytest.skip("docker CLI is not available")

    result = subprocess.run(
        [
            "docker",
            "compose",
            "--env-file",
            str(SINGLE_NODE_COMPOSE_FILE.parent / ".env.single-node.example"),
            "-f",
            str(SINGLE_NODE_COMPOSE_FILE),
            "config",
            "--quiet",
        ],
        check=False,
        capture_output=True,
        text=True,
        cwd=REPO_ROOT,
    )

    assert result.returncode == 0, result.stderr


def test_compose_declares_env_injection_for_runtime_services() -> None:
    compose = load_yaml(COMPOSE_FILE)
    services = compose["services"]

    assert {"postgres", "mqtt", "backend", "mediamtx", "media-control", "turn", "nginx", "edge"} <= set(services)
    assert "mysql" not in services
    assert services["backend"]["environment"]["DATABASE_URL"].startswith("${DATABASE_URL:")
    assert services["backend"]["environment"]["AUTH_JWT_SECRET"].startswith("${AUTH_JWT_SECRET:")
    assert services["backend"]["environment"]["AUTH_REFRESH_TOKEN_EXPIRE_MINUTES"] == (
        "${AUTH_REFRESH_TOKEN_EXPIRE_MINUTES:-120}"
    )
    assert services["backend"]["environment"]["AUTH_REFRESH_COOKIE_SECURE"] == "${AUTH_REFRESH_COOKIE_SECURE:-false}"
    assert services["backend"]["environment"]["AUTH_REFRESH_COOKIE_SAMESITE"] == "${AUTH_REFRESH_COOKIE_SAMESITE:-lax}"
    assert services["backend"]["environment"]["MQTT_HOST"] == "${MQTT_HOST:-mqtt}"
    assert services["backend"]["environment"]["MQTT_USERNAME"] == "${MQTT_USERNAME:?Set MQTT_USERNAME in .env}"
    assert services["backend"]["environment"]["MQTT_PASSWORD"] == "${MQTT_PASSWORD:?Set MQTT_PASSWORD in .env}"
    assert services["backend"]["environment"]["TELEMETRY_BUFFER_AUTO_FLUSH_MAX_ITEMS"] == (
        "${TELEMETRY_BUFFER_AUTO_FLUSH_MAX_ITEMS:-1000}"
    )
    assert services["backend"]["environment"]["CONTROL_MESSAGE_SENDER"] == "${CONTROL_MESSAGE_SENDER:-mqtt}"
    assert services["backend"]["environment"]["MEDIAMTX_PUBLIC_WEBRTC_BASE_URL"].startswith(
        "${MEDIAMTX_PUBLIC_WEBRTC_BASE_URL:"
    )
    assert services["backend"]["environment"]["WEBRTC_STUN_URL"] == ("${WEBRTC_STUN_URL:-stun:stun.l.google.com:19302}")
    assert services["backend"]["environment"]["DASHBOARD_MAP_PROVIDER"] == "${DASHBOARD_MAP_PROVIDER:-esri-satellite}"
    assert services["backend"]["environment"]["DASHBOARD_MAP_STYLE_URL"] == (
        "${DASHBOARD_MAP_STYLE_URL:-https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}}"
    )
    assert services["backend"]["environment"]["DASHBOARD_MAP_REQUIRES_API_KEY"] == (
        "${DASHBOARD_MAP_REQUIRES_API_KEY:-false}"
    )
    assert services["backend"]["environment"]["WEBRTC_TURN_URL"] == "${WEBRTC_TURN_URL:-}"
    assert services["media-control"]["environment"]["MEDIA_CONTROL_GRPC_LISTEN_ADDR"] == ":9090"
    assert services["media-control"]["environment"]["MEDIA_CONTROL_GRPC_TOKEN"] == (
        "${MEDIA_CONTROL_GRPC_TOKEN:-${MEDIA_CONTROL_PUBLISH_TOKEN:?Set MEDIA_CONTROL_PUBLISH_TOKEN in .env}}"
    )
    assert services["media-control"]["environment"]["MEDIA_CONTROL_GRPC_MAX_PAYLOAD_BYTES"] == (
        "${MEDIA_CONTROL_GRPC_MAX_PAYLOAD_BYTES:-65536}"
    )
    assert services["nginx"]["build"]["args"]["VITE_API_BASE_URL"] == "${VITE_API_BASE_URL:-/api}"
    assert services["nginx"]["build"]["args"]["VITE_IDENTITY_API_BASE_URL"] == (
        "${VITE_AUTH_API_BASE_URL:-/auth-policy/auth}"
    )
    assert services["nginx"]["build"]["args"]["VITE_STREAM_API_BASE_URL"] == (
        "${VITE_STREAM_API_BASE_URL:-/media-control}"
    )
    assert services["nginx"]["build"]["args"]["VITE_HLS_BASE_URL"] == "${VITE_HLS_BASE_URL:-/hls}"
    assert services["nginx"]["build"]["args"]["VITE_LOCAL_WEBCAM_WHIP_URL"].startswith("${VITE_LOCAL_WEBCAM_WHIP_URL:")
    assert services["nginx"]["build"]["args"]["VITE_WEBRTC_STUN_URL"] == (
        "${VITE_WEBRTC_STUN_URL:-stun:stun.l.google.com:19302}"
    )
    assert services["nginx"]["build"]["args"]["VITE_MAP_PROVIDER"] == "${VITE_MAP_PROVIDER:-esri-satellite}"
    assert services["nginx"]["build"]["args"]["VITE_MAP_STYLE_URL"] == (
        "${VITE_MAP_STYLE_URL:-https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}}"
    )


def test_local_compose_uses_hardened_mqtt_by_default() -> None:
    compose = load_yaml(COMPOSE_FILE)
    mqtt = compose["services"]["mqtt"]
    backend = compose["services"]["backend"]
    healthcheck_command = " ".join(mqtt["healthcheck"]["test"])

    assert mqtt["command"] == ["mosquitto", "-c", "/mosquitto/config/mosquitto.conf"]
    assert {
        "type": "bind",
        "source": "../deploy/mosquitto/mosquitto.hardened.conf",
        "target": "/mosquitto/config/mosquitto.conf",
        "read_only": True,
    } in mqtt["volumes"]
    assert {
        "type": "bind",
        "source": "../deploy/mosquitto/acl.hardened",
        "target": "/mosquitto/config/acl",
        "read_only": True,
    } in mqtt["volumes"]
    assert {
        "type": "bind",
        "source": "${MQTT_PASSWORD_FILE:?Set MQTT_PASSWORD_FILE in .env}",
        "target": "/mosquitto/config/passwords",
        "read_only": True,
    } in mqtt["volumes"]
    assert mqtt["environment"]["MQTT_HEALTH_USERNAME"] == "${MQTT_HEALTH_USERNAME:?Set MQTT_HEALTH_USERNAME in .env}"
    assert mqtt["environment"]["MQTT_HEALTH_PASSWORD"] == "${MQTT_HEALTH_PASSWORD:?Set MQTT_HEALTH_PASSWORD in .env}"
    assert "mosquitto_sub" in healthcheck_command
    assert "$$SYS/broker/version" in healthcheck_command
    assert "$${MQTT_HEALTH_USERNAME}" in healthcheck_command
    assert "$${MQTT_HEALTH_PASSWORD}" in healthcheck_command
    assert backend["depends_on"]["mqtt"]["condition"] == "service_healthy"


def test_no_auth_mqtt_is_only_available_as_explicit_local_smoke_profile() -> None:
    compose = COMPOSE_FILE.read_text(encoding="utf-8")
    override = load_yaml(LOCAL_MQTT_NO_AUTH_OVERRIDE)
    override_text = LOCAL_MQTT_NO_AUTH_OVERRIDE.read_text(encoding="utf-8")

    assert "mosquitto-no-auth.conf" not in compose
    assert override["services"]["mqtt"]["profiles"] == ["local-mqtt-no-auth"]
    assert override["services"]["mqtt"]["command"] == ["mosquitto", "-c", "/mosquitto-no-auth.conf"]
    assert "local-mqtt-no-auth" in override_text


def test_single_node_mqtt_is_hardened_by_default_and_healthcheck_authenticates() -> None:
    compose = load_yaml(SINGLE_NODE_COMPOSE_FILE)
    mqtt = compose["services"]["mqtt"]
    mqtt_healthcheck = mqtt["healthcheck"]["test"]
    healthcheck_command = " ".join(mqtt_healthcheck)

    assert mqtt["command"] == ["mosquitto", "-c", "/mosquitto/config/mosquitto.conf"]
    assert {
        "type": "bind",
        "source": "../mosquitto/mosquitto.hardened.conf",
        "target": "/mosquitto/config/mosquitto.conf",
        "read_only": True,
    } in mqtt["volumes"]
    assert {
        "type": "bind",
        "source": "../mosquitto/acl.hardened",
        "target": "/mosquitto/config/acl",
        "read_only": True,
    } in mqtt["volumes"]
    assert {
        "type": "bind",
        "source": "${MQTT_PASSWORD_FILE:?Set MQTT_PASSWORD_FILE}",
        "target": "/mosquitto/config/passwords",
        "read_only": True,
    } in mqtt["volumes"]
    assert mqtt["environment"]["MQTT_HEALTH_USERNAME"] == "${MQTT_HEALTH_USERNAME:?Set MQTT_HEALTH_USERNAME}"
    assert mqtt["environment"]["MQTT_HEALTH_PASSWORD"] == "${MQTT_HEALTH_PASSWORD:?Set MQTT_HEALTH_PASSWORD}"
    assert "mosquitto_sub" in healthcheck_command
    assert "$$SYS/broker/version" in healthcheck_command
    assert "$${MQTT_HEALTH_USERNAME}" in healthcheck_command
    assert "$${MQTT_HEALTH_PASSWORD}" in healthcheck_command
    assert "/dev/tcp" not in " ".join(mqtt_healthcheck)
    assert "nc -z" not in healthcheck_command


def test_single_node_keeps_redis_as_default_cache_runtime() -> None:
    compose = load_yaml(SINGLE_NODE_COMPOSE_FILE)
    redis = compose["services"]["redis"]

    assert redis["image"] == "redis@sha256:6ab0b6e7381779332f97b8ca76193e45b0756f38d4c0dcda72dbb3c32061ab99"
    assert redis["command"] == [
        "redis-server",
        "--appendonly",
        "yes",
        "--maxmemory",
        "${REDIS_MAXMEMORY:-384mb}",
        "--maxmemory-policy",
        "${REDIS_MAXMEMORY_POLICY:-volatile-ttl}",
        "--auto-aof-rewrite-percentage",
        "100",
        "--auto-aof-rewrite-min-size",
        "${REDIS_AOF_REWRITE_MIN_SIZE:-64mb}",
        "--requirepass",
        "${REDIS_PASSWORD:?Set REDIS_PASSWORD}",
    ]
    assert redis["healthcheck"]["test"] == [
        "CMD-SHELL",
        'redis-cli -a "$${REDIS_PASSWORD}" ping | grep PONG',
    ]


def test_single_node_bounds_container_logs_and_mobile_publisher_resources() -> None:
    compose = load_yaml(SINGLE_NODE_COMPOSE_FILE)
    services = compose["services"]

    for service in services.values():
        assert service["logging"]["driver"] == "json-file"
        assert service["logging"]["options"] == {
            "max-size": "${CONTAINER_LOG_MAX_SIZE:-10m}",
            "max-file": "${CONTAINER_LOG_MAX_FILES:-3}",
        }

    mobile_publisher = services["mobile-publisher"]
    assert mobile_publisher["pids_limit"] == 128
    assert mobile_publisher["mem_limit"] == "${MOBILE_PUBLISHER_MEMORY_LIMIT:-256m}"
    assert mobile_publisher["cpus"] == "${MOBILE_PUBLISHER_CPU_LIMIT:-0.5}"


def test_dragonfly_override_replaces_only_cache_runtime_contract() -> None:
    override = load_yaml(DRAGONFLY_OVERRIDE_FILE)
    redis = override["services"]["redis"]

    assert redis["image"] == "${DRAGONFLY_IMAGE:?Set DRAGONFLY_IMAGE}"
    assert redis["command"] == [
        "dragonfly",
        "--requirepass=${REDIS_PASSWORD:?Set REDIS_PASSWORD}",
        "--dir=/data",
    ]
    assert redis["volumes"] == ["dragonfly-data:/data"]
    assert redis["healthcheck"] == {"disable": True}
    assert "dragonfly-data" in override["volumes"]


def test_dragonfly_override_uses_application_readiness_instead_of_container_cli_healthcheck() -> None:
    override = load_yaml(DRAGONFLY_OVERRIDE_FILE)
    services = override["services"]

    assert services["auth-policy"]["depends_on"]["redis"]["condition"] == "service_started"
    assert services["media-control"]["depends_on"]["redis"]["condition"] == "service_started"


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
    assert services["media-control"]["environment"]["MEDIA_CONTROL_AUTH_MODE"] == (
        "${MEDIA_CONTROL_AUTH_MODE:-required}"
    )
    assert services["auth-policy"]["environment"]["AUTH_POLICY_SIGNUP_INVITES"] == ("${AUTH_POLICY_SIGNUP_INVITES:-}")
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
    assert services["media-control"]["environment"]["MEDIA_CONTROL_GRPC_LISTEN_ADDR"] == ":9090"
    assert services["media-control"]["ports"] == [
        "${LOCAL_BIND_ADDR:-127.0.0.1}:${MEDIA_CONTROL_GRPC_HOST_PORT:-9090}:9090"
    ]
    assert services["media-control"]["environment"]["MEDIA_CONTROL_GRPC_TOKEN"] == (
        "${MEDIA_CONTROL_GRPC_TOKEN:-${MEDIA_CONTROL_PUBLISH_TOKEN:?Set MEDIA_CONTROL_PUBLISH_TOKEN}}"
    )
    assert services["media-control"]["environment"]["MEDIA_CONTROL_GRPC_MAX_PAYLOAD_BYTES"] == (
        "${MEDIA_CONTROL_GRPC_MAX_PAYLOAD_BYTES:-65536}"
    )
    assert services["media-control"]["environment"]["MEDIA_CONTROL_STUN_URL"] == (
        "${MEDIA_CONTROL_STUN_URL:-stun:stun.l.google.com:19302}"
    )
    assert services["media-control"]["environment"]["MEDIA_CONTROL_TURN_PRIMARY_URL"] == (
        "${MEDIA_CONTROL_TURN_PRIMARY_URL:-turn:localhost:3478?transport=udp}"
    )
    assert services["media-control"]["environment"]["MEDIA_CONTROL_TURN_SECONDARY_URL"] == (
        "${MEDIA_CONTROL_TURN_SECONDARY_URL:-}"
    )
    assert services["turn-secondary"]["profiles"] == ["same-host-turn-redundancy"]
    assert "turn-secondary" not in services["media-control"]["depends_on"]
    assert services["media-control"]["environment"]["GOGC"] == "${MEDIA_CONTROL_GOGC:-100}"
    assert services["media-control"]["environment"]["GOMEMLIMIT"] == "${MEDIA_CONTROL_GOMEMLIMIT:-512MiB}"

    assert services["backend"]["environment"]["TELEMETRY_BUFFER_AUTO_FLUSH_MAX_ITEMS"] == (
        "${TELEMETRY_BUFFER_AUTO_FLUSH_MAX_ITEMS:-1000}"
    )
