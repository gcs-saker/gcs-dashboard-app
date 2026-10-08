# Redis session statistics and memory bounds — 2026-10-08

- Issue: `#856`
- Production deployment: `NOT_RUN`

Publish-session readiness no longer performs Redis `SCAN` followed by up to 1,000 `HGETALL` commands.
Session state transitions maintain atomic status counters and expiry/created sorted-set indexes. Statistics
reads are constant-size apart from a bounded cleanup batch of at most 1,000 expired sessions. More than
1,000 active sessions no longer marks readiness truncated solely because of cardinality.

The authentication rate limiter replaces per-request full-map cleanup with an expiry queue capped at 64
cleanup operations per request. Telemetry timeout cleanup removes all retained alert-rule state for the
device. Metrics remain aggregate-only and do not use UUID/session identifiers as labels.
