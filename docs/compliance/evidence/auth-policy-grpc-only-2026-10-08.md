# Auth Policy gRPC-only production policy — 2026-10-08

- Issue: `#850`
- Production deployment: `NOT_RUN`

Single-node and closed-network policy authentication, stream authorization, publish authorization,
binding validation, and telemetry ingest require the Auth Policy mTLS gRPC target and PKI. Missing RPC
configuration fails startup instead of silently selecting REST.

The legacy HTTP implementation remains available only when the local compose explicitly sets
`AUTH_POLICY_ALLOW_HTTP_FALLBACK=true`. Control authorization and lifecycle audit HTTP endpoints are
owned APIs rather than automatic fallbacks; their gRPC contract migration remains separately traceable.

Automated tests cover missing-target startup rejection, missing-RPC device authentication rejection,
explicit local-test fallback, operational Compose PKI wiring, and existing REST/gRPC decision parity.
