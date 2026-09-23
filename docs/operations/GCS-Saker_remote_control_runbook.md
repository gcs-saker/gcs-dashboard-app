# Remote-control command operations runbook

Hardware activation remains disabled. This runbook covers the virtual command plane only.

## Signals

- `control_commands_total{result,error_code}` uses bounded labels only.
- `control_command_duration_seconds{result}` measures accepted-to-result latency.
- Audit records contain operation, approved command enum, result, stable error code, and UTC time.
  They never contain raw device UUID, command/session token, MQTT topic, receiver, or private route.

## Response

1. Rising `timeout`: verify broker health, device heartbeat, lease expiry, and ACK subscription.
2. `sequence_rejected` or `expired`: stop the control UI, revoke the lease, and inspect client clock
   and retry behavior. Do not replay the original command.
3. `lease_mismatch` or `unauthorized`: preserve sanitized evidence and investigate identity/group
   state. Do not manually override routing.
4. `device_unavailable` or `internal`: require fail-safe STOP, end the lease, and keep hardware
   activation blocked until the device reports a safe state.
5. If metrics or audit output contains an identifier, token, topic, or private route, treat it as a
   security incident and stop command-plane testing.
