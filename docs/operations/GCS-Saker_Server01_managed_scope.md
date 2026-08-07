# Server-01 managed scope

As of 2026-08-05, only the production host reached through SSH port `55121` is managed by this repository's deployment and operational procedures. Server-02 and SSH port `55122` are outside the managed scope and must not be probed, deployed, restarted, or used as an availability fallback.

The only accepted deployment identity is:

- `DEPLOYMENT_TARGET=server01-production`
- `COMPOSE_PROJECT_NAME=gcs-saker-m2-production`
- public origin `https://a4ai.121-159-26-245.sslip.io`

Every release must preserve the container identities of PostgreSQL, Redis, MQTT, MediaMTX, both TURN services, and the externally supplied mobile publisher during stateless deployment. Intentional stateful maintenance is a separate operation with a backup, explicit service list, and post-maintenance smoke evidence.

Run `scripts/ops/server01_operational_smoke.sh` after deployment. Historical documents can retain Server-02 evidence, but they are not current operating instructions.
