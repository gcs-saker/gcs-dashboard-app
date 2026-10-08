# MQTT positive and negative E2E — 2026-10-08

- Issue: `#846`
- Environment: disposable local Docker networks and containers
- Production deployment: `NOT_RUN`
- Physical device: `NOT_RUN`

## Result

| Boundary | Scenario | Result |
| --- | --- | --- |
| Mosquitto TLS | Valid device and Media Control certificates on TLS 1.3/8883 | PASS |
| Mosquitto TLS | Anonymous client without certificate | PASS — rejected |
| Mosquitto CRL | Revoked device certificate | PASS — rejected |
| Mosquitto ACL | Device certificate publishing under another device UUID | PASS — not delivered |
| Mosquitto limit | Payload larger than 64 KiB | PASS — not delivered |
| MQTT to gRPC | Valid session-bound protobuf telemetry | PASS — accepted |
| MQTT to gRPC | QoS 1 duplicate event ID | PASS — acknowledged without duplicate store |
| MQTT to gRPC | Forged and expired publish tokens | PASS — rejected |
| MQTT to gRPC | Wrong session, changed group, and ended session | PASS — rejected |
| MQTT to gRPC | Malformed and oversized protobuf payloads | PASS — rejected |
| Recovery | Broker restart followed by certificate-authenticated reconnect | PASS |

The broker checks prove transport identity, revocation, topic authorization, and size enforcement. The
application integration checks prove opaque session/token binding and protobuf validation. A broker ACL
intentionally cannot decide whether an opaque publish session is current; Media Control owns that decision.

## Reproduction

The hardened broker matrix is executed by:

```bash
pki_dir="$(mktemp -d)"
trap 'rm -rf -- "$pki_dir"' EXIT
INCLUDE_MQTT_SMOKE_IDENTITY=1 scripts/ops/prepare_internal_pki.sh "$pki_dir"
python3 scripts/smoke/mqtt_hardened_profile_smoke.py --run --pki-dir "$pki_dir"
```

The MQTT-to-gRPC matrix is executed by the CI `Verify MQTT to gRPC session boundary` step against the
isolated `mqtt-contract-broker` container. Runtime output contains only stable scenario names and status;
credentials, tokens, UUID secrets, and private routes are not recorded.

This evidence does not claim Server-01 or physical-radio qualification. Those remain `NOT_RUN` until an
approved deployment and equipment test window.
