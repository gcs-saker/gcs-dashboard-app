# GCS-Saker Compose lifecycle runbook

`scripts/ops/compose_lifecycle.py` is the canonical host-reboot start and controlled-stop entrypoint for the
existing Server-01 production containers. It never creates or recreates a container. Initial installation,
image replacement, migration, and rollback remain owned by the signed deployment scripts.

## Start order

The command validates the rendered Compose secret files before mutation, then starts and waits for each existing
container in this order: PostgreSQL, Redis, MQTT, auth-policy, backend, media-control, MediaMTX, TURN, dashboard,
and edge. A missing container, invalid secret, unhealthy dependency, or readiness timeout fails closed. Edge is
therefore never exposed while an earlier dependency is only partially ready.

## Stop order

Controlled stop uses the exact reverse order, beginning with edge and ending with PostgreSQL. Compose service
stop grace periods remain authoritative. The external mobile publisher is not created, stopped, or modified.

## Commands

Use `plan-start` or `plan-stop` first. `check` validates target, paths, rendered configuration, and secret files
without starting or stopping anything. Production execution requires absolute private paths and
`--deployment-target server01-production`.

```bash
python3 scripts/ops/compose_lifecycle.py plan-start \
  --compose-file /absolute/release/deploy/compose/compose.single-node.poc.yml \
  --env-file /absolute/private/deployment.env \
  --deployment-target server01-production
```

Cold installation with absent stateful containers is rejected. Use the approved deployment flow with a verified
backup instead of weakening this guard or adding fixed sleeps.
