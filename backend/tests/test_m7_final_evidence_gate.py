from __future__ import annotations

import importlib.util
import json
import subprocess
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPT = REPO_ROOT / "scripts" / "gates" / "m7_final_evidence_gate.py"


def load_gate_module():
    spec = importlib.util.spec_from_file_location("m7_final_evidence_gate", SCRIPT)
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def test_m7_final_evidence_gate_check_prints_stable_command_contract() -> None:
    result = subprocess.run(
        [sys.executable, str(SCRIPT), "--check"],
        check=False,
        capture_output=True,
        text=True,
        cwd=REPO_ROOT,
    )

    assert result.returncode == 0, result.stderr
    payload = json.loads(result.stdout)
    assert payload["schemaVersion"] == "m7-final-evidence-gate-v1"
    categories = set(payload["requiredCategories"])
    assert "performance-contract" in categories
    assert "streaming-low-latency" in categories
    assert "compose-integration" in categories
    assert "runtime-observability" in categories
    command_names = {command["name"] for command in payload["commands"]}
    assert "telemetry_bulk_benchmark" in command_names
    assert "webrtc_ice_contract" in command_names
    assert "m10_runtime_evidence_contract" in command_names
    assert "closed_network_static" in command_names


def test_m7_final_evidence_gate_module_lists_required_evidence_commands() -> None:
    module = load_gate_module()

    payload = module.build_check_report()

    assert payload["schemaVersion"] == "m7-final-evidence-gate-v1"
    commands = {command["name"]: command for command in payload["commands"]}
    assert commands["default_compose_config"]["needsDocker"] is True
    assert commands["closed_network_compose_config"]["needsDocker"] is True
    assert commands["mqtt_hardened_contract"]["category"] == "mqtt-control-plane"
    assert commands["m10_runtime_evidence_contract"]["category"] == "runtime-observability"
    assert commands["grpc_contract"]["category"] == "protocol-runtime"


def test_m7_final_evidence_gate_run_smoke_passes_required_commands() -> None:
    result = subprocess.run(
        [sys.executable, str(SCRIPT), "--run", "--timeout-seconds", "120"],
        check=False,
        capture_output=True,
        text=True,
        cwd=REPO_ROOT,
    )

    assert result.returncode == 0, result.stderr
    payload = json.loads(result.stdout)
    assert payload["schemaVersion"] == "m7-final-evidence-gate-v1"
    assert payload["complete"] is True
    assert payload["failedRequired"] == []
    results = {result["name"]: result for result in payload["results"]}
    assert results["benchmark_schema"]["status"] == "passed"
    assert results["telemetry_bulk_benchmark"]["status"] == "passed"
    assert results["webrtc_ice_contract"]["status"] == "passed"


def test_m7_final_evidence_gate_reports_failed_required_command() -> None:
    module = load_gate_module()
    command = module.EvidenceCommand(
        name="forced_failure",
        category="test",
        description="검증 실패가 gate 실패로 반영되는지 확인한다.",
        command=[sys.executable, "-c", "import sys; sys.exit(3)"],
    )

    result = module.run_command(command, timeout_seconds=10)

    assert result.status == "failed"
    assert result.name == "forced_failure"


def test_m7_final_evidence_gate_skips_docker_when_cli_is_unavailable(monkeypatch) -> None:
    module = load_gate_module()
    command = module.EvidenceCommand(
        name="docker_required",
        category="compose-integration",
        description="Docker CLI가 없는 개발 환경에서는 명확히 skip 처리한다.",
        command=["docker", "compose", "config", "--quiet"],
        needs_docker=True,
    )
    monkeypatch.setattr(module.shutil, "which", lambda _: None)

    result = module.run_command(command, timeout_seconds=10)

    assert result.status == "skipped-docker-unavailable"
    assert "docker CLI is not available" in result.stderr


def test_m7_final_evidence_gate_parse_args_defaults_to_check(monkeypatch) -> None:
    module = load_gate_module()
    monkeypatch.setattr(sys, "argv", ["m7_final_evidence_gate.py"])

    args = module.parse_args()

    assert args.check is True
    assert args.run is False
