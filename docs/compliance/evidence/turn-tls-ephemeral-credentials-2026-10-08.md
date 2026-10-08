# TURN TLS fallback and ephemeral credentials — 2026-10-08

- Issue: `#853`
- Production deployment: `NOT_RUN`

UDP TURN remains the primary low-latency path on 3478. TCP/TLS fallback is available through `turns:`
on 5349 with an internal-CA server certificate. Media Control continues to issue coturn REST HMAC
credentials with a five-minute expiry; the shared secret is never returned or logged.

Disposable runtime checks confirmed TLS 1.3 negotiation for `turn-primary` and rejection of an invalid
server name. Existing TURN relay E2E and credential HMAC/expiry suites remain the promotion gates.
