# GCS-Saker remote-control command contract

Status: PR-1 contract baseline; transport, policy, UI, and hardware activation are not implemented by
this document.

`ControlLease` establishes an opaque, bounded server-issued control session for one device.
`ControlCommandEnvelope` carries a monotonic sequence, issue/expiry times, an idempotency identifier,
an approved command enum, and typed parameters. `ControlCommandAck` returns the applied sequence and a
stable result/error enum.

The contract intentionally contains no receiver address, MQTT topic, group selector, private route,
function name, or executable payload. Those values remain server- or device-adapter-owned. STOP and
EMERGENCY_STOP require no arbitrary payload; MOTION and CAMERA_PAN_TILT use typed numeric messages whose
allowed ranges will be enforced by the policy and device-capability PRs.

Legacy `StreamCommand` and `CommandAck` fields remain at their original gateway numbers. New control
messages use field 31, outside the existing reserved ranges. Removed or reserved numbers are not
reused.

This baseline does not authorize real movement. Hardware activation remains `BLOCKED` until lease,
authorization, sequence/expiry, dead-man STOP, adapter, audit, and MIL-STD-882E hazard tests pass.

## PR-2 policy baseline

Auth-policy permits lease acquisition only for an active same-group operator or group administrator
whose security version matches authoritative identity state. Viewer and System Administrator roles,
inactive groups, inactive devices, sibling devices, stale identity, and a conflicting live lease fail
closed with stable domain denial codes. An expired lease may be replaced.

Command authorization binds the authenticated username, device, opaque control session, and lease
expiry. Return-home requires explicit high-risk confirmation. Emergency stop remains available to an
otherwise authorized lease holder without an extra confirmation step so safety action is not delayed.
The domain policy performs no Redis, database, broker, clock, UUID, or network I/O; persistence and
atomic lease acquisition belong to the following routing/session PR.

## PR-3 routing and lease persistence

Media-control resolves a command route only from a server-known active publish session whose device
identity matches the requested opaque device. Ended, expired, missing, corrupt, or mismatched sessions
fail closed. Group and MQTT command topic remain private fields of an internal route object and cannot
be serialized accidentally as an HTTP response.

Control lease acquisition uses Redis `SET NX` with a maximum 30-second TTL. Redis keys use a versioned
namespace and a SHA-256 digest of the device identity, never the raw device identifier. Invalid opaque
identifiers, invalid TTLs, and store failures return typed sanitized errors.

## PR-4 MQTT command and acknowledgement boundary

The command transport accepts only a server-resolved internal route and a protobuf command whose
device, command ID, control session, sequence, idempotency ID, issue time, and expiry are valid.
Commands live for at most five seconds, reserve idempotency before sequence acceptance, publish at
QoS 1, and fail closed on duplicate, reordered, oversized, expired, timeout, or broker failure.

ACK payloads are bounded protobuf messages received only from the server-session ACK topic. The topic
session must equal the ACK control session and the ACK must identify a command and non-zero sequence.
Malformed, oversized, or cross-session acknowledgements are rejected before state mutation.

## PR-5 virtual device adapter

The virtual adapter maps only approved command enums to fixed actuator methods. Motion and camera
axes reject NaN, infinity, and values outside `[-1, 1]`; unsupported commands and session mismatch
return stable NACK codes. No command contains a function name or executable content.

The adapter binds one opaque lease, accepts heartbeat only for that lease, and invokes STOP once when
heartbeat age exceeds three seconds, the lease expires, or the connection closes. Emergency stop maps
directly to its dedicated actuator function. This is a simulator boundary and does not enable hardware.

## PR-6 dashboard dead-man input

The dashboard control pad emits typed motion intent only and receives no receiver address, topic, or
private route. WASD keydown updates normalized axes; final keyup emits STOP. Window blur, tab hiding,
pointer cancellation, pointer departure, explicit stop, and component unmount also emit STOP.
Keyboard events originating from input, textarea, select, or editable content are ignored so control
cannot capture text-entry keystrokes. The pad remains disabled until a future API supplies an active
opaque control session.

## PR-10A public HTTP boundary

Media-control exposes POST-only control-session and command endpoints. The service fails closed with
503 until an application control service is injected, requires an Authorization header, rejects
unknown or oversized JSON fields, and returns only opaque session/command state. Public response DTOs
contain no group, receiver, MQTT topic, device route, token, or private path. Runtime policy, Redis,
MQTT, and dashboard wiring remain required before the pad can be enabled.

## Ownership layout

HTTP handlers own only public DTO decoding and status mapping. `internal/controlapp` owns orchestration
across policy, route, lease, sequence, and command ports. Kotlin control policy is physically located
in the root domain package that owns its package declaration. Transport, persistence, device adapter,
and dashboard input remain separate owners. Repository tests prevent application logic from moving
back into the HTTP transport folder or reintroducing package-path mismatch.

## PR-10B auth-policy boundary

Auth-policy exposes an authenticated internal control decision endpoint. It resolves the principal
from the bearer token, loads the authoritative registered device and group status, rejects unknown
actions or commands, and delegates acquisition/command decisions to `ControlLeasePolicy`. The caller
cannot override principal role, group, or security version. The response contains only allowed,
stable reason, and the server-confirmed group; media-control runtime injection remains outstanding.
