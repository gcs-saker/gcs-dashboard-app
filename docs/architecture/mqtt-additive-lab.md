# Additive MQTT telemetry lab

Status: local-only opt-in. Existing REST and credential-authenticated gRPC remain available.
No production deployment or public MQTT listener is enabled by this change.

## Routing and authority

- A device registers and obtains a publish session through the existing REST API.
- MQTT topic: `gcs/device/<sessionId>/telemetry`; response topic: `gcs/device/<sessionId>/result`.
- Payload: canonical `gcs.saker.v1.MqttGatewayMessage` from `contracts/proto/gcs/saker/v1/mqtt_gateway.proto`.
- `publish_token` is the opaque short-lived publish token, never the device credential.
- `request` is `GatewayStreamRequest` with telemetry. `org_id` and `group_id` may be omitted.
  If `group_id` is supplied it must match the authenticated device. Asset IDs must match the device UUID.
- The MQTT adapter forwards to the existing gRPC Exchange method with `authorization: Bearer <publishToken>`
  and `x-gcs-publish-session-id: <sessionId>`. No receiver or group destination is accepted from MQTT.
- Gateway validates token, session, current stream binding, expiry, current registered device group and policy versions.
- Internal device authentication, binding validation and telemetry storage use the private DevicePolicyService gRPC API
  when the lab overlay enables `AUTH_POLICY_GRPC_TARGET`. REST compatibility is retained when this is unset.
- Stream reads use the active Redis session index, not a path-derived default group. Unknown sessions fail closed.
  Existing sessions predating the stream index must be reissued before testing this build.
- PostgreSQL is the authoritative device registry. Redis owns live session-to-stream bindings, with expiry matching
  renewal expiry plus one minute. New sessions replace the stream index; old sessions cannot regain it by renewal.
- Telemetry without a session remains supported through legacy credential-authenticated gRPC. Only the session path
  guarantees rejection of samples observed before session creation. Do not claim legacy input is session-bound.

## Automated isolated test

From the repository root:

```powershell
docker compose -f deploy/compose/compose.mqtt-test.yml up --abort-on-container-exit --exit-code-from tests
docker compose -f deploy/compose/compose.mqtt-test.yml down
```

This creates only a separate test project with Redis, Mosquitto and Go tests. No host broker ports are published.
The integration test uses real MQTT and a real gRPC gateway with fixture policy/storage, not production credentials.
It checks successful session telemetry, forged token rejection, group mismatch rejection and ended-session rejection.
Redis lifecycle/index tests and Kotlin private-RPC authorization/storage tests cover the other boundaries separately.
This is not a substitute for physical-drone or production end-to-end acceptance.

## Local application lab

Use the normal local compose environment plus `compose.mqtt-lab.override.yml` under a distinct compose project name.
Prepare an owner-only password file with `mosquitto_passwd` (interactive password entry, not command-line passwords):

1. Add user `mqtt-ingress` with the password referenced by `MQTT_LAB_INGRESS_PASSWORD`.
2. Issue a device publish session; add its session ID as a broker username with a separate random password.
3. Set `AUTH_POLICY_RPC_TOKEN` (random, at least 32 characters) and the absolute `MQTT_LAB_PASSWORD_FILE` path.
4. Start the local stack with both compose files. Never apply the overlay to production.
5. Connect locally to `127.0.0.1:18883`, authenticate with the session username/password, subscribe to its result topic,
   and publish the canonical protobuf envelope with QoS 1 and retain=false.
6. Rotate the publish token through the existing REST renewal endpoint before expiry and use the new token in payloads.

The loopback lab listener is plaintext for local testing only. Remote devices require a separately configured TLS
listener/VPN and broker credential provisioning; no public exposure is authorized by this document.
The adapter uses MQTT 3.1.1, a bounded 64-message queue, 64 KiB limit and bounded operation timeouts.
Automatic reconnect is disabled: a connection failure stops the optional adapter and logs a sanitized failure.
Restart the local adapter after fixing the broker; HTTP/gRPC ingress remains independent.
MQTT PUBACK is transport receipt, not DB completion: use the GatewayStreamResponse on the result topic.
On missing/failed results retry with the same telemetry event ID; never infer storage from PUBACK.

## Remaining rollout gates

- Group/session migration and reissue rehearsal, including account-based publishers.
- Physical drone reconnect, token renewal and multi-device load tests.
- Production broker TLS, automated short-lived broker credentials/ACL lifecycle and adapter readiness metrics.
- The lab routes media-control stream policy, device/account publish authorization and telemetry through private gRPC;
  the existing internal HTTP adapters remain as a rollback option when `AUTH_POLICY_GRPC_TARGET` is unset.
- Session-authenticated telemetry persists `sessionId` and `streamId` (V25 migration), returned as optional REST fields.
  Legacy credential-based samples keep these fields null for compatibility.
