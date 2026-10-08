# Final canonical-path E2E qualification — 2026-10-08

- Tracker: `#843`
- Issue: `#857`
- Local disposable Docker: `PASS`
- Server-01: `NOT_RUN`
- Physical mobile/drone/audio: `BLOCKED`

## Virtual-device load

The in-process MQTT ingress partition test excludes broker, network, gRPC and database latency. It is a
software queue/order/backpressure qualification, not a field latency claim.

| Devices | Messages | Failed | Lost | Backpressure | Order errors | Max queue | p95 ms | Throughput/s |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 10 | 100 | 0 | 0 | 0 | 0 | 1 | 0.035 | 97.97 |
| 50 | 500 | 0 | 0 | 0 | 0 | 1 | 0.013 | 459.78 |
| 100 | 1,000 | 0 | 0 | 0 | 0 | 1 | 0.022 | 908.43 |

## Qualified boundaries

- MQTT TLS 1.3 client identity, ACL, CRL, payload limits and reconnect;
- Media Control canonical session routing, command lease/sequence/replay and ACK binding;
- Backend/Media Control/Auth Policy gRPC mTLS and denial of missing identities;
- PostgreSQL verify-full and Redis TLS with plaintext/server-name negative tests;
- MediaMTX private authenticated management callback;
- TURN UDP primary plus TLS 1.3 TCP fallback and expiring HMAC credentials;
- stream-session signal wake-up and bounded fallback polling;
- Redis statistics, rate limiter and alert-state memory bounds.

Public browser REST/SSE/WebRTC behavior remains covered by the existing frontend/browser CI. Actual
mobile publisher, microphone/talkback, external NAT, Server-01 performance and physical equipment remain
`BLOCKED` or `NOT_RUN`; they are not inferred from local virtual tests.
