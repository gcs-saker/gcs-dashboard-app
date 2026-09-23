from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[2]
GATE = ROOT / "docs/compliance/hardware/remote-control-qualification.yml"


def test_remote_control_hardware_activation_fails_closed() -> None:
    gate = yaml.safe_load(GATE.read_text(encoding="utf-8"))

    assert gate["currentPhase"] == "SOFTWARE_ONLY"
    assert gate["hardwareActivationAllowed"] is False
    assert gate["overallVerdict"] == "BLOCKED"
    assert gate["blocker"]
    assert all(item["verdict"] == "BLOCKED" for item in gate["qualification"])


def test_capability_adapter_rejects_dynamic_execution_and_requires_fail_safe() -> None:
    profile = yaml.safe_load(GATE.read_text(encoding="utf-8"))["capabilityAdapter"]

    assert profile["failSafeState"] == "STOP"
    assert {"STOP", "MOTION", "RETURN_HOME", "EMERGENCY_STOP"} <= set(profile["requiredFunctions"])
    assert "arbitrary function name" in profile["forbiddenFunctions"]
    assert "script execution" in profile["forbiddenFunctions"]
    assert "browser-selected MQTT topic" in profile["forbiddenFunctions"]
