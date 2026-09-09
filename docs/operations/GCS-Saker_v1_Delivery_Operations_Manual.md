# GCS-Saker v1 delivery operations manual

## Managed target

Only Server-01 through SSH port 55121 is managed. Server-02 is never probed or used as fallback.
Public ingress is `https://gcs-saker.com`; PostgreSQL, Redis, MQTT, internal gRPC, metrics, and
management endpoints remain private.

## Release and deployment

1. Require green CI for one immutable source commit.
2. Resolve license and VEX gates, then produce the signed four-image digest manifest.
3. Verify Cosign identity, SLSA provenance, SPDX attestation, source revision, and image digests.
4. Before stateful change, create and verify PostgreSQL and broker backups.
5. Run `safe_stateless_deploy.sh`; never build application images on Server-01.
6. Validate public health/readiness, unauthenticated denial, container health, and exact revision.

## Routine checks

- Inspect `/healthz`, `/readyz`, container health, disk, audit-volume percentage, certificate expiry,
  clock status, TURN allocation, stream visibility, first-frame latency, and Talkback state.
- Never record credentials, UUIDs, tokens, private routes, raw audio, or private keys in evidence.
- Use the named PKI rotation, audit off-load, recovery verification, TLS, and WebRTC smoke tools.

## Failure and rollback

Stateless rollback uses the captured prior images and Compose file. Database, MQTT, MediaMTX, TURN,
and edge identities must remain unchanged unless an explicitly approved stateful rehearsal has a
verified backup. A failed health, denial, availability, or revision check triggers rollback and is
recorded as FAIL—not PASS.

## Release decision

`delivery-readiness.yml` is authoritative. A `BLOCKED` or `NOT_RUN` item prevents the v1.0.0 tag.
Physical equipment absence remains BLOCKED, and independent penetration testing cannot be replaced
by internal automation.
