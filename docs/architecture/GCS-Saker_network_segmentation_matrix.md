# GCS-Saker network segmentation matrix

The single-node runtime uses purpose-owned Docker bridge networks. Membership is an allowlist: adding a service requires a contract change and a negative-connectivity regression test.

| Network | Gateway | Members | Permitted purpose |
| --- | --- | --- | --- |
| `control-net` | internal only | PostgreSQL, Redis, backend, auth-policy, media-control | database, cache, and internal application RPC |
| `broker-net` | internal only | MQTT, media-control | authenticated device telemetry and command events |
| `edge-net` | internal only | edge, dashboard, mobile publisher, backend, auth-policy, media-control | reverse-proxy upstream traffic only |
| `stream-net` | external gateway | edge, backend, media-control, MediaMTX | HLS/WebRTC signaling, media management, and ICE-related egress |
| `turn-net` | external gateway | MediaMTX, TURN primary, TURN secondary | TURN peer validation and relay traffic |
| `egress-net` | external gateway | backend, auth-policy, media-control | explicitly configured map, time, AI, tracing, and service egress |

The external-gateway networks do not publish a port by themselves. Host ingress remains limited to ports explicitly declared by `edge`, `mediamtx`, and TURN services. PostgreSQL, Redis, MQTT, and management endpoints have no host publication.

Presentation containers do not join `control-net` or `broker-net`. MQTT has exactly one server-side peer, `media-control`, which validates opaque session identity before forwarding owned data. TURN cannot reach the control or broker planes, and MediaMTX cannot reach database or cache services.

Host firewall and Docker forwarding-chain policy remain a separate operational control. Compose membership constrains container discovery and direct east-west paths; it does not replace Server-01 ingress and forwarding rules.

## Rendered-path audit and disposable benchmark

`docker_network_path_audit.py` validates the rendered Compose JSON, including overrides, against
`deploy/network/runtime-path-policy.json`. It fails on membership drift, a shared network between explicitly denied
peers, a non-internal private bridge, or publication of database, cache, broker, gRPC, and management ports.

`docker_network_path_benchmark.py` is restricted to `local-fixture` and a `gcs-net-fixture-*` network. Its pinned,
read-only, capability-free probe reports bounded DNS and TCP-connect p50/p95/p99. It refuses Server-01 and does not
claim application, media, TURN, or packet-loss qualification. Those require their owned disposable fault-injection
and soak tools before any driver, MTU, sysctl, or firewall change is considered.
