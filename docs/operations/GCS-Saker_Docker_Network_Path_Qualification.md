# GCS-Saker Docker network path qualification

This procedure separates static path authorization from performance measurement. Passing the path audit does not
prove latency, packet-loss tolerance, TURN relay quality, or host firewall correctness.

## Rendered-path audit

Render the exact Compose profile and overrides into an owner-only temporary JSON file, then run
`docker_network_path_audit.py` with `deploy/network/runtime-path-policy.json`. Delete the temporary file after the
result is captured. The audit checks exact network membership, private bridge isolation, denied peer separation,
and published-port policy without recording addresses, container IDs, or secret paths.

The host still requires `server01_firewall_drift_check.py`; bridge membership cannot replace Docker-USER, nftables,
UFW, or router ingress policy.

## Disposable latency baseline

Create only a disposable network whose name starts with `gcs-net-fixture-`. Start a disposable target on that
network, then run `docker_network_path_benchmark.py` with `--deployment-target local-fixture`. The pinned probe is
read-only, drops every capability, has bounded memory/PIDs, and collects at most 100 DNS and TCP-connect samples.

Record p50/p95/p99 and failure count for each owned path. Compare changes only under the same host load and sample
count. Do not infer streaming or Talkback quality from TCP-connect latency. Packet loss, jitter, reordering, MTU,
TURN, and WebRTC require separate owned fixtures and are still `NOT_RUN` in this source-only segment.

No network driver, MTU, sysctl, firewall, or production Compose change is authorized by this measurement alone.
