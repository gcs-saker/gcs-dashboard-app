# Server-01 Ansible hardening and drift detection

This automation manages only the inventory host `server01-production` through SSH `55121`. No Server-02 host, group, port, fallback, or play is defined.

Install the pinned controller collection and run the audit in check mode:

```bash
cd deploy/ansible
ansible-galaxy collection install -r collections/requirements.yml
ansible-playbook playbooks/server01_hardening.yml --check --diff
```

The default `server01_apply_hardening=false` prevents mutation even if `--check` is accidentally omitted. Audit commands are read-only and produce a bounded summary without credentials, environment values, container inspection data, or raw firewall rules. Unreadable required evidence results in `BLOCKED`, not `PASS`.

Applying changes requires all of the following:

```text
server01_apply_hardening=true
server01_maintenance_window_approved=true
server01_confirm_ssh_key_access=true
```

Before approval, verify an independent SSH key session on port `55121`, retain the current UFW/SSH configuration, and prepare out-of-band recovery. Run `--check --diff` first and review every task. Do not apply this role as part of an application deployment.

The role installs and enables auditd, chrony, and UFW; hardens SSH; limits host input to HTTPS and managed SSH; and protects the materialized runtime secret directory. Docker forwarding policy remains owned by the separate read-only drift checker and reviewed `DOCKER-USER` policy. The role intentionally does not rewrite Docker daemon JSON or recursively change ownership of stateful data and release directories.
