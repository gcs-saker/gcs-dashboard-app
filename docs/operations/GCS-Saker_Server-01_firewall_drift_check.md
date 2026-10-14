# Server-01 firewall and Docker forwarding drift check

`scripts/ops/server01_firewall_drift_check.py` is a read-only check. It does not apply UFW, nftables, iptables, Docker, or sysctl changes.

Run the contract check in CI:

```bash
python scripts/ops/server01_firewall_drift_check.py --check
```

Run the live check locally on Server-01 only:

```bash
sudo python scripts/ops/server01_firewall_drift_check.py
```

The command returns `PASS`, `FAIL`, or `BLOCKED` JSON evidence. `BLOCKED` means Docker or firewall state could not be read and must never be reported as a pass.

The initial allowlist permits only these non-loopback container bindings:

- MediaMTX WebRTC ICE `8189/tcp` and `8189/udp`;
- TURN control `3478/tcp`, `3478/udp`, and `5349/tcp`;
- TURN UDP relay ports `49160-49200`.

HTTPS `443/tcp` is terminated by the Server-01 host edge and is not a Docker container binding in this check. PostgreSQL, Redis, MQTT, HLS, RTSP, RTMP, MediaMTX management, metrics, dashboard, backend, and auth-policy container ports must remain loopback-only or unpublished.

The Docker forwarding check requires a `DOCKER-USER` chain, an explicit `RELATED,ESTABLISHED` return rule, and a terminal `DROP` or `REJECT`. This is a drift detector, not a complete rule installer. The follow-up firewall policy must add explicit allow rules before the terminal deny and preserve SSH port `55121` outside Docker forwarding.

Capture the JSON with the immutable source revision during Server-01 validation. Review every failure before changing a rule; never flush a live firewall or recreate stateful containers as a remediation shortcut.
