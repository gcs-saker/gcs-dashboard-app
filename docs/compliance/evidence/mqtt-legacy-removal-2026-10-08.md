# Legacy group-bearing MQTT telemetry removal — 2026-10-08

- Issue: `#847`
- Production deployment: `NOT_RUN`
- Physical device migration: `NOT_RUN`

## Result

The Python compatibility API no longer starts or contains an MQTT telemetry subscriber. Mosquitto no
longer permits device telemetry on `gcs/{orgId}/{groupId}/{assetId}/telemetry`; the only telemetry
namespace is `gcs/device/{deviceUuid}/{publishSession}/telemetry`, consumed by Media Control.

Device-provided `groupId` is rejected at the MQTT message boundary even if it happens to match the
authoritative group. Media Control obtains group membership from the opaque publish session and policy
service. This prevents a device from selecting or guessing a receiver scope.

The legacy command topic remains temporarily isolated behind the backend/device ACL entries identified
for removal by `#848`. It is not a telemetry ingress and does not restore the retired Python subscriber.

## Regression gates

- Python runtime contains no `mqtt.subscriber` or `MqttConsumerBridge` lifecycle.
- Runtime configuration contains no legacy telemetry feature flag.
- Mosquitto contains no group-bearing telemetry publish/read ACL.
- Canonical Media Control MQTT-to-gRPC positive and negative E2E remains active.
- Non-empty device `groupId` is rejected before the gRPC exchange.

This is source and disposable-container evidence. Server-01 remains unchanged until a separately
authorized deployment passes the production health, authorization-denial, container, and source-revision gates.
