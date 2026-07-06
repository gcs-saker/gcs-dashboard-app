from __future__ import annotations

from pathlib import Path
import importlib.util
import json
import subprocess
import sys


REPO_ROOT = Path(__file__).resolve().parents[2]
GRPC_SMOKE = REPO_ROOT / "scripts" / "smoke" / "grpc_runtime_smoke.py"
DRAGONFLY_SMOKE = REPO_ROOT / "scripts" / "smoke" / "dragonfly_profile_smoke.py"
POSTGIS_SMOKE = REPO_ROOT / "scripts" / "smoke" / "postgis_runtime_smoke.py"
MQTT_SMOKE = REPO_ROOT / "scripts" / "smoke" / "mqtt_hardened_profile_smoke.py"


def run_check(script: Path) -> dict:
    result = subprocess.run(
        [sys.executable, str(script), "--check"],
        check=False,
        capture_output=True,
        text=True,
        cwd=REPO_ROOT,
    )

    assert result.returncode == 0, result.stderr
    return json.loads(result.stdout)


def load_script_module(script: Path, module_name: str):
    spec = importlib.util.spec_from_file_location(module_name, script)
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def test_grpc_runtime_smoke_reports_integrated_runtime_state_and_follow_up_gates() -> None:
    payload = run_check(GRPC_SMOKE)

    assert payload["schemaVersion"] == "grpc-runtime-smoke-v1"
    assert payload["status"] == "runtime-integrated"
    assert payload["descriptorCommand"][:3] == [
        "protoc",
        f"--proto_path={REPO_ROOT / 'contracts' / 'proto'}",
        f"--descriptor_set_out={REPO_ROOT / 'tmp' / 'gcs-saker-grpc-gateway.pb'}",
    ]
    assert payload["descriptorFallbackCommand"][:3] == [sys.executable, "-m", "grpc_tools.protoc"]
    assert "client implementation behind MessageSender abstraction" in payload["implementedRuntime"]
    assert "SakerGatewayService.Exchange server implementation in media-control" in payload["implementedRuntime"]
    assert "explicit GatewayStreamRequest and GatewayStreamResponse DTO mappers" in payload["implementedRuntime"]
    assert "planned telemetry, stream_event, command_ack payloads over one bidi stream" in payload["implementedRuntime"]
    assert payload["requestPayloads"] == ["telemetry", "stream_event", "command_ack"]
    assert "native/device gateway packaging outside smoke script" in payload["remainingBeforeFullActive"]
    assert "telemetry, stream_event, and command_ack" in payload["promotionGate"]


def test_grpc_runtime_smoke_falls_back_to_grpc_tools_when_protoc_is_missing(monkeypatch, tmp_path) -> None:
    module = load_script_module(GRPC_SMOKE, "grpc_runtime_smoke_for_test")
    config = module.GrpcRuntimeSmokeConfig(
        proto_root=module.PROTO_ROOT,
        gateway_proto=module.GATEWAY_PROTO,
        descriptor_set=tmp_path / "gateway.pb",
    )

    def fake_run(command, **_kwargs):
        if command[0] == "protoc":
            raise FileNotFoundError("protoc")

        class Result:
            returncode = 0
            stderr = ""

        return Result()

    monkeypatch.setattr(module.subprocess, "run", fake_run)

    result = module.compile_descriptor(config)

    assert result["compiled"] is True
    assert result["compiler"] == "grpc_tools.protoc"


def test_grpc_runtime_smoke_reports_descriptor_failure_when_all_compilers_fail(monkeypatch, tmp_path) -> None:
    module = load_script_module(GRPC_SMOKE, "grpc_runtime_smoke_failure_test")
    config = module.GrpcRuntimeSmokeConfig(
        proto_root=module.PROTO_ROOT,
        gateway_proto=module.GATEWAY_PROTO,
        descriptor_set=tmp_path / "gateway.pb",
    )

    def fake_run(command, **_kwargs):
        class Result:
            returncode = 2
            stderr = f"{command[0]} failed"

        return Result()

    monkeypatch.setattr(module.subprocess, "run", fake_run)

    result = module.compile_descriptor(config)

    assert result["compiled"] is False
    assert result["returnCode"] == 2
    assert [attempt["name"] for attempt in result["attempts"]] == ["protoc", "grpc_tools.protoc"]


def test_grpc_runtime_smoke_main_defaults_to_check(monkeypatch, capsys) -> None:
    module = load_script_module(GRPC_SMOKE, "grpc_runtime_smoke_main_test")
    monkeypatch.setattr(sys, "argv", ["grpc_runtime_smoke.py"])

    exit_code = module.main()
    payload = json.loads(capsys.readouterr().out)

    assert exit_code == 0
    assert payload["schemaVersion"] == "grpc-runtime-smoke-v1"
    assert payload["descriptorFallbackCommand"][:3] == [sys.executable, "-m", "grpc_tools.protoc"]


def test_dragonfly_profile_smoke_reports_profile_state_and_equivalence_gate() -> None:
    payload = run_check(DRAGONFLY_SMOKE)

    assert payload["schemaVersion"] == "dragonfly-profile-smoke-v1"
    assert payload["status"] == "profile-runtime-contract"
    profile_names = {profile["name"] for profile in payload["profiles"]}
    assert profile_names == {"redis", "dragonfly"}
    dragonfly = next(profile for profile in payload["profiles"] if profile["name"] == "dragonfly")
    assert "-f" in dragonfly["configCommand"]
    assert str(REPO_ROOT / "deploy" / "compose" / "compose.dragonfly.override.yml") in dragonfly["configCommand"]
    assert "GETDEL" in payload["redisCommandSubset"]
    assert "auth-policy refresh session uses SETEX/GETDEL" in "\n".join(payload["cacheKeyContracts"])
    assert "media-control cache miss or cache error falls back" in "\n".join(payload["degradedBehavior"])
    assert payload["license"]["dragonfly"] == "BSL 1.1"
    assert "Redis and DragonFly runtime smoke results are equivalent" in payload["promotionGate"]


def test_postgis_profile_smoke_reports_runtime_query_contract() -> None:
    payload = run_check(POSTGIS_SMOKE)

    assert payload["schemaVersion"] == "postgis-runtime-smoke-v1"
    assert "postgres-geo" in payload["command"]
    assert "EXPLAIN (ANALYZE, BUFFERS, WAL)" in payload["sql"]


def test_mqtt_hardened_profile_smoke_reports_acl_and_protobuf_runtime_contract() -> None:
    payload = run_check(MQTT_SMOKE)

    assert payload["schemaVersion"] == "mqtt-hardened-profile-smoke-v1"
    assert payload["status"] == "hardened-profile-runtime-contract"
    assert payload["profile"]["composeMode"] == "default-hardened"
    assert payload["profile"]["overrideFile"] is None
    assert "device telemetry publish reaches backend subscriber" in payload["runtimeChecks"]
    assert payload["protobufBoundary"]["telemetry"].startswith("protobuf TelemetryEnvelope")
    assert "dashboard never receives MQTT credentials" in "\n".join(payload["allowedFlows"])
    assert "default hardened MQTT active" in payload["promotionGate"]
