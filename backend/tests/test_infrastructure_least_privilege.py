from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[2]
COMPOSE = ROOT / "deploy/compose/compose.single-node.poc.yml"


def test_redis_and_mediamtx_use_read_only_least_privilege_profiles() -> None:
    services = yaml.safe_load(COMPOSE.read_text(encoding="utf-8"))["services"]

    redis = services["redis"]
    assert redis["user"] == "999:1000"
    assert redis["read_only"] is True
    assert redis["cap_drop"] == ["ALL"]
    assert redis["security_opt"] == ["no-new-privileges:true"]
    assert redis["tmpfs"] == ["/tmp:rw,noexec,nosuid,nodev,size=16m"]

    mediamtx = services["mediamtx"]
    assert mediamtx["read_only"] is True
    assert mediamtx["cap_drop"] == ["ALL"]
    assert mediamtx["security_opt"] == ["no-new-privileges:true"]


def test_secret_consumers_receive_only_the_runtime_reader_group() -> None:
    services = yaml.safe_load(COMPOSE.read_text(encoding="utf-8"))["services"]
    consumers = {
        "postgres-geo",
        "redis",
        "backend",
        "auth-policy",
        "media-control",
        "mediamtx",
        "turn-primary",
        "turn-secondary",
    }

    for name in consumers - {"turn-primary", "turn-secondary"}:
        assert services[name]["group_add"] == ["${GCS_SECRET_RUNTIME_GID:-10050}"]


def test_turn_services_run_non_root_without_linux_capabilities() -> None:
    services = yaml.safe_load(COMPOSE.read_text(encoding="utf-8"))["services"]

    for name in ("turn-primary", "turn-secondary"):
        service = services[name]
        assert service["user"] == "65534:65534"
        assert service["read_only"] is True
        assert service["cap_drop"] == ["ALL"]
        assert service["security_opt"] == ["no-new-privileges:true"]
        assert service["group_add"] == ["${GCS_SECRET_RUNTIME_GID:-10050}", "${GCS_PKI_RUNTIME_GID:-1000}"]
        assert service["tmpfs"] == ["/tmp:rw,noexec,nosuid,nodev,size=16m"]


def test_mqtt_runs_non_root_with_only_owned_write_paths() -> None:
    mqtt = yaml.safe_load(COMPOSE.read_text(encoding="utf-8"))["services"]["mqtt"]

    assert mqtt["user"] == "1883:1883"
    assert mqtt["read_only"] is True
    assert mqtt["cap_drop"] == ["ALL"]
    assert mqtt["security_opt"] == ["no-new-privileges:true"]
    assert mqtt["group_add"] == ["${GCS_PKI_RUNTIME_GID:-1000}"]
    assert mqtt["tmpfs"] == [
        "/tmp:rw,noexec,nosuid,nodev,size=16m",
        "/mosquitto/log:rw,noexec,nosuid,nodev,size=16m,uid=1883,gid=1883,mode=0750",
    ]
