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

## Disposable netem matrix

`docker_network_fault_fixture.py` builds the pinned local probe, creates an internal
`gcs-net-fixture-*` network, and runs equal-sized baseline, 50±10 ms delay, 1% loss, and 5% reordering conditions.
The target has no Linux capabilities; only the disposable probe runs as root with `NET_ADMIN` so it can apply
`tc netem` to its own interface. Every other capability is dropped, privilege escalation is disabled, and the
root filesystem is read-only. Both containers and the internal network are removed in `finally`, including failed
runs.

The matrix currently qualifies DNS and TCP connection establishment only. Docker being unavailable is recorded as
`BLOCKED`, never `PASS`. Stream, Talkback, MQTT application latency, TURN allocation, ICE selection, CPU cost,
conntrack pressure, and packet-capture metadata remain separate follow-up measurements.

## MQTT application round trip

`docker_mqtt_netem_fixture.py` reuses the same internal fixture and fault matrix with a pinned Mosquitto broker.
Its standard-library MQTT 3.1.1 client performs CONNECT, SUBSCRIBE, PUBLISH, and received-PUBLISH timing for every
sample. The report separates requested samples, received messages, failures, and p50/p95/p99 broker round trip.
The test broker has no host port, persistence, production certificate, account, ACL, or data mount. Passing this
fixture does not qualify production mTLS, authorization, telemetry processing, command execution, or reconnect.

## TURN allocation round trip

`docker_turn_netem_fixture.py` starts a pinned coturn process with only `NET_BIND_SERVICE`, fixture-only long-term
credentials, and no host ports, TLS, production secret, certificate, peer allowlist, or relay data. The probe reuses
the owned `turn_relay_smoke.py` protocol implementation to verify the 401 challenge, MESSAGE-INTEGRITY, allocation
success, and XOR-RELAYED-ADDRESS under every netem condition. Reports separate requested samples, successful
allocations, failures, and p50/p95/p99. Allocation success alone does not qualify relay packet flow, ICE selection,
WebRTC media, Talkback audio, external NAT, production TLS, or credential authorization.
