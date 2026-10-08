# Stream-session SSE version signal — 2026-10-08

- Issue: `#854`
- Production deployment: `NOT_RUN`

Stream-session writes now publish an in-process version signal that immediately wakes connected SSE
streams. The previous one-second unconditional database query loop is replaced by a 15-second fallback
for multi-instance changes that occur outside the current process. Existing authorization, heartbeat,
event names, response DTOs, and no-buffering headers remain unchanged.

Tests cover immediate wake-up, fallback timeout, interruption cleanup, and the absence of the old sleep
poll. At steady state this reduces stream-session list queries from approximately 60/minute per connection
to 4/minute, while local writes remain immediate.
