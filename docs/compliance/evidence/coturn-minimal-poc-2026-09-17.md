# Minimal Coturn PoC evidence — 2026-09-17

- Production deployment: `NOT_RUN`
- Compose integration: `NOT_RUN`
- Isolated Docker WHIP/WHEP relay-only: `PASS`
- Physical mobile Talkback: `BLOCKED`

The pinned Coturn 4.18.0 PoC compiled without PostgreSQL, MySQL, MongoDB, Redis, SQLite,
Prometheus, systemd, Kerberos, or GSSAPI links. Long-term and shared-secret allocation passed.
Relay packet loop completed 10/10 messages with zero receive loss.

With an isolated MediaMTX that did not advertise loopback as an additional host, relay-only WHIP
connected and WHEP selected `local=relay, remote=host, protocol=udp`. The receiver decoded both
video and audio. Measured first-frame latency was 819.5 ms for video and 191.0 ms for audio.
A rejected private candidate still produced a non-fatal 403 before the allowed MediaMTX candidate
bound successfully; the final selected pair and media path were relay.

This evidence does not authorize replacing production Coturn. Physical mobile Talkback and the
production shared-secret/allowlist profile remain required before promotion.
