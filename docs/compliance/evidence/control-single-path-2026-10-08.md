# Control command single-path qualification — 2026-10-08

- Issue: `#848`
- Production deployment: `NOT_RUN`
- Physical actuator: `NOT_RUN`

The Python `/control` endpoint, direct MQTT publisher, sender selector, group-bearing command topic, and
associated runtime credentials were removed. The only application command path is now:

`Frontend REST → Media Control control session → Auth Policy → server-owned publish session route → canonical MQTT command`

Media Control enforces a 30-second exclusive lease, exact monotonic sequence, bounded command expiry,
Redis-backed idempotency/replay rejection, and a server-resolved
`gcs/device/{deviceUuid}/{publishSession}/command` topic. Policy decisions must return the same group as
the authoritative publish session. ACK decoding rejects a different device or publish session.

Automated evidence covers successful command/ACK round trip, lease conflicts, duplicate idempotency IDs,
sequence replay/gaps, expiry, cross-group policy denial, cross-session ACK denial, and removal of the
Python control transport. Server-01 and physical actuator behavior remain `NOT_RUN` until separately authorized.
