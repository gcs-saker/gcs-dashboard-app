from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[2]
COMPOSE = ROOT / "deploy/compose/compose.single-node.poc.yml"
CONFIG = ROOT / "deploy/otel/collector.gateway.yml"


def test_collector_is_internal_opt_in_and_least_privilege() -> None:
    service = yaml.safe_load(COMPOSE.read_text(encoding="utf-8"))["services"]["otel-collector"]

    assert service["profiles"] == ["observability"]
    assert service["image"].endswith("@sha256:39923a8e431bd1f57be82411999d389fcfe40857492e4365456d97a4c1f74be6}")
    assert service["user"] == "10001:10001"
    assert service["read_only"] is True
    assert service["cap_drop"] == ["ALL"]
    assert service["security_opt"] == ["no-new-privileges:true"]
    assert service["networks"] == ["control-net"]
    assert "ports" not in service


def test_collector_limits_memory_and_batch_size() -> None:
    config = yaml.safe_load(CONFIG.read_text(encoding="utf-8"))
    processors = config["processors"]

    assert processors["memory_limiter"] == {
        "check_interval": "1s",
        "limit_mib": 192,
        "spike_limit_mib": 48,
    }
    assert processors["batch"]["send_batch_size"] == 512
    assert processors["batch"]["send_batch_max_size"] == 1024


def test_collector_removes_sensitive_and_high_cardinality_attributes() -> None:
    config = yaml.safe_load(CONFIG.read_text(encoding="utf-8"))
    deleted = {
        action["key"]
        for processor_name in ("resource/sanitize", "attributes/sanitize")
        for action in config["processors"][processor_name].get(
            "attributes", config["processors"][processor_name].get("actions")
        )
    }

    assert {
        "authorization",
        "http.request.header.authorization",
        "http.request.header.cookie",
        "url.query",
        "enduser.id",
        "user.name",
        "client.address",
        "network.peer.address",
        "device.uuid",
        "stream.id",
        "service.instance.id",
        "host.id",
    } <= deleted


def test_collector_has_no_external_exporter_or_public_management_surface() -> None:
    config = yaml.safe_load(CONFIG.read_text(encoding="utf-8"))

    assert set(config["exporters"]) == {"debug"}
    assert config["exporters"]["debug"]["sampling_initial"] == 5
    assert config["exporters"]["debug"]["sampling_thereafter"] == 200
    assert config["extensions"]["health_check"]["endpoint"] == "0.0.0.0:13133"
    assert config["service"]["telemetry"]["metrics"]["level"] == "basic"


def test_backend_otlp_export_is_disabled_bounded_and_not_a_dependency() -> None:
    services = yaml.safe_load(COMPOSE.read_text(encoding="utf-8"))["services"]
    backend = services["backend"]

    assert backend["environment"]["OTEL_TRACES_ENABLED"] == "${BACKEND_OTEL_TRACES_ENABLED:-false}"
    assert backend["environment"]["OTEL_TRACES_EXPORTER"] == "${BACKEND_OTEL_TRACES_EXPORTER:-none}"
    assert backend["environment"]["OTEL_EXPORTER_OTLP_ENDPOINT"].endswith("otel-collector:4317}")
    assert backend["environment"]["OTEL_EXPORT_TIMEOUT_SECONDS"] == "${BACKEND_OTEL_EXPORT_TIMEOUT_SECONDS:-1.0}"
    assert backend["environment"]["OTEL_BSP_MAX_QUEUE_SIZE"] == "${BACKEND_OTEL_BSP_MAX_QUEUE_SIZE:-512}"
    assert backend["environment"]["OTEL_BSP_MAX_EXPORT_BATCH_SIZE"] == (
        "${BACKEND_OTEL_BSP_MAX_EXPORT_BATCH_SIZE:-128}"
    )
    assert "otel-collector" not in backend["depends_on"]


def test_media_control_otlp_export_is_disabled_bounded_and_not_a_dependency() -> None:
    services = yaml.safe_load(COMPOSE.read_text(encoding="utf-8"))["services"]
    media_control = services["media-control"]
    environment = media_control["environment"]

    assert environment["MEDIA_CONTROL_TRACE_EXPORTER"] == "${MEDIA_CONTROL_TRACE_EXPORTER:-none}"
    assert environment["MEDIA_CONTROL_OTEL_ENDPOINT"] == "${MEDIA_CONTROL_OTEL_ENDPOINT:-otel-collector:4317}"
    assert environment["MEDIA_CONTROL_OTEL_EXPORT_TIMEOUT_SECONDS"] == (
        "${MEDIA_CONTROL_OTEL_EXPORT_TIMEOUT_SECONDS:-1.0}"
    )
    assert environment["MEDIA_CONTROL_OTEL_MAX_QUEUE_SIZE"] == "${MEDIA_CONTROL_OTEL_MAX_QUEUE_SIZE:-512}"
    assert environment["MEDIA_CONTROL_OTEL_MAX_EXPORT_BATCH_SIZE"] == (
        "${MEDIA_CONTROL_OTEL_MAX_EXPORT_BATCH_SIZE:-128}"
    )
    assert "otel-collector" not in media_control["depends_on"]


def test_auth_policy_otlp_export_is_disabled_bounded_and_not_a_dependency() -> None:
    services = yaml.safe_load(COMPOSE.read_text(encoding="utf-8"))["services"]
    auth_policy = services["auth-policy"]
    environment = auth_policy["environment"]

    assert environment["AUTH_POLICY_OTEL_TRACES_ENABLED"] == "${AUTH_POLICY_OTEL_TRACES_ENABLED:-false}"
    assert environment["AUTH_POLICY_OTEL_ENDPOINT"] == (
        "${AUTH_POLICY_OTEL_ENDPOINT:-http://otel-collector:4318/v1/traces}"
    )
    assert environment["AUTH_POLICY_OTEL_EXPORT_TIMEOUT"] == "${AUTH_POLICY_OTEL_EXPORT_TIMEOUT:-1s}"
    assert environment["AUTH_POLICY_OTEL_SCHEDULE_DELAY"] == "${AUTH_POLICY_OTEL_SCHEDULE_DELAY:-2s}"
    assert environment["AUTH_POLICY_OTEL_MAX_QUEUE_SIZE"] == "${AUTH_POLICY_OTEL_MAX_QUEUE_SIZE:-512}"
    assert environment["AUTH_POLICY_OTEL_MAX_BATCH_SIZE"] == "${AUTH_POLICY_OTEL_MAX_BATCH_SIZE:-128}"
    assert "otel-collector" not in auth_policy["depends_on"]
