import importlib.util
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts/ops/server01_firewall_drift_check.py"


def load_module():
    spec = importlib.util.spec_from_file_location("server01_firewall_drift_check", SCRIPT)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def container(name: str, ports: dict) -> dict:
    return {"Name": f"/{name}", "NetworkSettings": {"Ports": ports}}


def test_check_mode_is_read_only_and_stable() -> None:
    result = subprocess.run([sys.executable, str(SCRIPT), "--check"], check=False, capture_output=True, text=True)

    assert result.returncode == 0
    assert result.stdout.strip() == "Server-01 firewall drift check contract passed"


def test_private_management_binding_passes() -> None:
    module = load_module()
    payload = [container("postgres-geo", {"5432/tcp": [{"HostIp": "127.0.0.1", "HostPort": "5432"}]})]

    result = module.check_public_bindings(module.parse_bindings(payload))

    assert result.status == "PASS"


def test_public_database_binding_fails() -> None:
    module = load_module()
    payload = [container("postgres-geo", {"5432/tcp": [{"HostIp": "0.0.0.0", "HostPort": "5432"}]})]

    result = module.check_public_bindings(module.parse_bindings(payload))

    assert result.status == "FAIL"
    assert "5432/tcp" in result.detail


def test_public_webrtc_and_turn_ports_are_allowlisted() -> None:
    module = load_module()
    payload = [
        container("mediamtx", {"8189/udp": [{"HostIp": "0.0.0.0", "HostPort": "8189"}]}),
        container("turn-primary", {"49160/udp": [{"HostIp": "0.0.0.0", "HostPort": "49160"}]}),
    ]

    result = module.check_public_bindings(module.parse_bindings(payload))

    assert result.status == "PASS"


def test_docker_user_requires_stateful_return_and_default_deny() -> None:
    module = load_module()
    passing = """
    -N DOCKER-USER
    -A DOCKER-USER -m conntrack --ctstate RELATED,ESTABLISHED -j ACCEPT
    -A DOCKER-USER -j DROP
    """
    missing_deny = passing.replace("-A DOCKER-USER -j DROP", "-A DOCKER-USER -j RETURN")

    assert {result.status for result in module.check_docker_user_rules(passing)} == {"PASS"}
    assert any(result.status == "FAIL" for result in module.check_docker_user_rules(missing_deny))


def test_policy_is_external_and_targets_server_01() -> None:
    module = load_module()
    policy = module.load_policy()

    assert policy["server"] == "Server-01"
    assert policy["hostIngress"]["tcp"] == [443, 55121]
    assert policy["dockerPublicBindings"]["mediamtx"]["udp"] == [8189]


def test_return_or_unconditional_accept_cannot_bypass_default_deny() -> None:
    module = load_module()
    unconditional = """
    -N DOCKER-USER
    -A DOCKER-USER -j ACCEPT
    -A DOCKER-USER -j DROP
    """
    early_return = """
    -N DOCKER-USER
    -A DOCKER-USER -j RETURN
    -A DOCKER-USER -j DROP
    """

    assert any(
        result.name == "firewall.rule_order" and result.status == "FAIL"
        for result in module.check_docker_user_rules(unconditional)
    )
    assert any(
        result.name == "firewall.rule_order" and result.status == "FAIL"
        for result in module.check_docker_user_rules(early_return)
    )
