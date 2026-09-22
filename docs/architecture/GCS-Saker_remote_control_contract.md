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
