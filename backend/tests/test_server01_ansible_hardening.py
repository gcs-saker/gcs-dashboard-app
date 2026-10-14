import subprocess
import sys
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[2]
ANSIBLE_ROOT = ROOT / "deploy/ansible"
INVENTORY = ANSIBLE_ROOT / "inventory/server01.example.yml"
PLAYBOOK = ANSIBLE_ROOT / "playbooks/server01_hardening.yml"
DEFAULTS = ANSIBLE_ROOT / "roles/server01_hardening/defaults/main.yml"
MAIN_TASKS = ANSIBLE_ROOT / "roles/server01_hardening/tasks/main.yml"
AUDIT_TASKS = ANSIBLE_ROOT / "roles/server01_hardening/tasks/audit.yml"
APPLY_TASKS = ANSIBLE_ROOT / "roles/server01_hardening/tasks/apply.yml"


def test_inventory_contains_only_server01_on_managed_ssh_port() -> None:
    inventory = yaml.safe_load(INVENTORY.read_text(encoding="utf-8"))
    hosts = inventory["all"]["children"]["server01_managed"]["hosts"]

    assert set(hosts) == {"server01-production"}
    assert hosts["server01-production"]["ansible_port"] == 55121
    assert "55122" not in INVENTORY.read_text(encoding="utf-8")


def test_playbook_is_serial_and_fail_closed() -> None:
    play = yaml.safe_load(PLAYBOOK.read_text(encoding="utf-8"))[0]
    defaults = yaml.safe_load(DEFAULTS.read_text(encoding="utf-8"))
    tasks = MAIN_TASKS.read_text(encoding="utf-8")

    assert play["hosts"] == "server01_managed"
    assert play["serial"] == 1
    assert play["any_errors_fatal"] is True
    assert defaults["server01_apply_hardening"] is False
    assert defaults["server01_maintenance_window_approved"] is False
    assert defaults["server01_confirm_ssh_key_access"] is False
    assert "Only Server-01 on SSH 55121 is managed" in tasks


def test_audit_is_read_only_and_blocked_evidence_fails_closed() -> None:
    audit = AUDIT_TASKS.read_text(encoding="utf-8")

    for command in ("sshd -T", "ufw status", "docker", "timedatectl", "systemctl is-enabled"):
        assert command in audit
    assert "changed_when: false" in audit
    assert "BLOCKED" in audit
    assert "do not report PASS" in audit


def test_apply_requires_approved_security_controls() -> None:
    apply = APPLY_TASKS.read_text(encoding="utf-8")

    assert "PasswordAuthentication" in apply
    assert "PermitRootLogin" in apply
    assert "X11Forwarding" in apply
    assert "community.general.ufw" in apply
    assert "server01_required_tcp_ports" in apply
    assert "server01_runtime_secret_root" in apply
    assert "/etc/docker/daemon.json" not in apply


def test_all_ansible_yaml_files_parse() -> None:
    for path in ANSIBLE_ROOT.rglob("*.yml"):
        assert yaml.safe_load(path.read_text(encoding="utf-8")) is not None, path


def test_existing_firewall_contract_still_passes() -> None:
    script = ROOT / "scripts/ops/server01_firewall_drift_check.py"
    result = subprocess.run(
        [sys.executable, str(script), "--check"],
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
