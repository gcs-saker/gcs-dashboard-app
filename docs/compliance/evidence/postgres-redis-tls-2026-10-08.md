# PostgreSQL and Redis internal TLS — 2026-10-08

- Issue: `#851`
- Production deployment: `NOT_RUN`

The single-node/closed-network profile disables the Redis plaintext port and enables its TLS listener.
PostgreSQL enables its TLS listener with an internal-CA server identity. Backend and Auth Policy use
PostgreSQL `verify-full`; Media Control uses a TLS 1.3 Redis client with CA and `redis` server-name
verification. Spring Redis uses a PEM trust bundle. Connection and pool timeouts remain bounded.

Missing CA/server-name configuration fails Media Control startup. Plaintext Redis remains available only
in the explicit local compose. Runtime validation on Server-01 remains `NOT_RUN`.

## Disposable runtime results

| Check | Result |
| --- | --- |
| PostgreSQL `verify-full` connection and `pg_stat_ssl.ssl` | PASS (`t`) |
| PostgreSQL `sslmode=disable` connection | PASS — rejected by `pg_hba.conf` |
| Redis TLS connection with internal CA and `redis` server name | PASS (`PONG`) |
| Redis plaintext connection to the TLS-only port | PASS — connection reset |
| Redis incorrect server name | PASS — certificate verification rejected |
| PostgreSQL and Redis container health | PASS |
| Auth Policy Flyway/JPA over PostgreSQL `verify-full` | PASS |
| Auth Policy principal/session cache over Redis PEM trust bundle | PASS |
| Auth Policy health after both TLS connections | PASS |
