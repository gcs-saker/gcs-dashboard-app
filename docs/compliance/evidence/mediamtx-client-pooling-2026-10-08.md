# MediaMTX client pooling and snapshots — 2026-10-08

- Issue: `#855`
- Production deployment: `NOT_RUN`

The Python compatibility client now owns one bounded-timeout HTTP connection pool instead of creating a
client per request. A one-second snapshot coalesces concurrent path reads; stale data is bounded to five
seconds during a MediaMTX management outage and can be explicitly invalidated.

The active Go Media Control path already uses an application-owned HTTP client, Redis-backed short TTL
stream snapshots, defensive copies, presence indexing, and a mutex-protected single-flight refresh.
Regression tests cover concurrent misses, Redis degradation, stale bounds, and upstream call reduction.
