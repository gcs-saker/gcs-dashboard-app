# Backend to Media Control gRPC mTLS — 2026-10-08

- Issue: `#849`
- Production deployment: `NOT_RUN`

Media Control's gRPC listener now requires TLS 1.3 mutual authentication against the internal CA.
Backend client configuration requires CA, client certificate, private key, target, server name, and a
bounded timeout. The reusable channel is explicitly closed and reused for multiple stream calls.

The Media Control MQTT adapter's process-local gRPC hop uses the same authenticated listener instead of
an unconditional insecure channel. Plaintext is available only through the explicit local-test override.

## Verified scenarios

| Scenario | Result |
| --- | --- |
| Backend certificate to Media Control certificate handshake | PASS |
| Server-name validation for `media-control` | PASS |
| Request/response over the authenticated bidi stream | PASS |
| Plaintext client against operational listener | PASS — rejected |
| Missing or invalid certificate files | PASS — rejected |
| Client channel reuse, bounded timeout, idempotent close | PASS |
| Operational Compose configuration | PASS — plaintext false and read-only PKI mounts |

The test used a disposable internal CA and did not contact Server-01. Production runtime validation
remains `NOT_RUN` until a separately authorized deployment window.
