# Remote-control Docker E2E — 2026-09-23

- Parent issue: `#790`
- Result: `PASS`
- Hardware activation: `BLOCKED`
- Production deployment: `NOT_RUN`

The Docker E2E runs the auth-policy lease/authorization tests in a clean Gradle/JDK 21 container,
then runs the control-session and virtual-adapter suites with the Go race detector. A loopback test
executes the server-owned route, protobuf MQTT publish boundary, fixed virtual actuator handler, ACK
serialization, ACK session validation, and fail-safe/emergency-stop behavior in one flow.

Covered negative paths include role/group/device/stale identity policy denials, lease conflict,
duplicate idempotency, reordered sequence, expiry, unsupported/range errors, cross-session ACK,
heartbeat loss, disconnect, bounded observability labels, and audit identity leakage.

This evidence qualifies the software-only virtual command plane. It does not claim actual motor,
servo, flight-controller, vehicle, radio-link, or environmental safety behavior.
