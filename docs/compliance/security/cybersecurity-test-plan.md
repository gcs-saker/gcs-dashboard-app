# GCS-Saker Cybersecurity Test Plan

## Scope

This plan assesses the software-only product boundary: dashboard, edge, backend compatibility API,
auth-policy, media-control, PostgreSQL, Redis, MQTT, MediaMTX, TURN, contracts, build pipeline,
release evidence, and Server-01 operations. Physical hardware qualification is excluded.

## Controlled environments

- Pull-request CI runs isolated unit, integration, browser, broker, contract, SBOM, and image scans.
- Local qualification uses disposable containers and synthetic accounts, devices, streams, audio, and telemetry.
- Production validation targets Server-01 on SSH 55121 only and uses non-destructive health, denial, revision, and container checks.
- Production credentials, private media, and raw customer data are prohibited in public evidence.

## Test classes

1. Authentication: missing, malformed, expired, replayed, revoked, inactive, and changed-principal sessions.
2. Authorization: same group, ancestor, descendant, sibling, unknown group, stale session, and object spoofing.
3. Input: malformed, boundary, oversized, duplicate, out-of-order, and protocol-incompatible values.
4. Communications: TLS, DTLS-SRTP, future mTLS, certificate expiry, TURN credential lifetime, and plaintext denial.
5. Application: session handling, error sanitization, CSP, CORS, rate limits, API inventory, and management separation.
6. Supply chain: audit, SBOM, EOL, license, image scan, signature, provenance, and exception expiry.
7. Resilience: service loss, timeout, bounded retry, backpressure, restart, backup restore, and rollback.
8. Audit: required event, actor/scope/result, UTC, integrity, retention, access, and secret redaction.

## Evidence and verdict

Each procedure records requirement/control IDs, source commit, environment, tool versions, inputs,
raw artifact hashes, expected result, actual result, verdict, reviewer, and timestamp. Verdicts use
PASS, FAIL, BLOCKED, NOT_RUN, and NOT_APPLICABLE. A FAIL, expired waiver, missing artifact, or
hash mismatch cannot be reported as PASS.

## Release gates

- Critical or supported fix-available High vulnerabilities block release.
- New public listener, unauthenticated protected operation, cross-group access, secret disclosure,
  missing safety/security negative test, provenance mismatch, or failed rollback readiness blocks release.
- Open findings are tracked in the POA&M with owner, mitigation, due date, and residual risk.

