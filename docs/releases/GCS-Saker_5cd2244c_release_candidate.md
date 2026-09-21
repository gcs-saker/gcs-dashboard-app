# GCS-Saker release candidate 5cd2244c

## Immutable source

- Candidate source: `5cd2244c6fdb21938d032f4a9a0b656eac157224`
- Server-01 source before rollout: `9636df6b629cf15f5b60a8de016e181096aa90c3`
- Server-01 deployed source after rollout: `5cd2244c6fdb21938d032f4a9a0b656eac157224`
- Candidate CI: GitHub Actions runs `35563231872` and `35554060377`, both successful
- Signed release workflow: GitHub Actions run `35568805767`, successful
- Deployment target: Server-01 production only

## Operator-visible changes

- Mobile publishing defers reconnect while offline or backgrounded, uses bounded `1s/2s/5s` retry, and exposes recovery evidence.
- Camera and microphone `mute`, `unmute`, `ended`, pagehide, and reload have explicit safe states.
- Selected remote stream audio is retained as waveform history without mixing another stream or the local microphone.
- Account, group, and role changes revoke existing publish, playback, and Talkback WebRTC sessions.
- System status identifies publish-session store failure, scan truncation, or cleanup delay and provides bounded Runbook guidance.
- Administrators can acknowledge, start, and resolve alerts with append-only audit evidence and persisted latest state.

Normal login, publish, playback, and Talkback controls remain in the same user workflow. Expected disruption during a
stateless application replacement is a short reconnect rather than a user data migration.

## Database migration qualification

- Starting schema: Flyway `V29`
- Candidate migration: `V30__operational_alert_acknowledgements.sql`
- Forward migration: `PASS`
- Candidate health after migration: `PASS`
- Acknowledgement write/read: `PASS`
- Application rollback to the pre-V30 auth-policy image with the V30 table retained: `PASS`
- Rolled-back health and operator login: `PASS`
- Stored V30 row retained after application rollback: `PASS`

The schema migration is forward-only. Application rollback must not drop the V30 table. A verified PostgreSQL backup is
required before production migration.

## Server-01 production qualification

- PostgreSQL pre-V30 backup and `pg_restore --list` verification: `PASS`
- MQTT data backup and archive verification: `PASS`
- Signed MQTT, MediaMTX, and TURN sequential rollout: `PASS`
- Signed backend, auth-policy, media-control, and dashboard rollout: `PASS`
- Flyway V30 applied: `PASS`
- Public health and readiness: `200 / 200`
- Unauthenticated protected stream API: `401`
- Runtime source revision for all seven replaced containers: candidate commit
- Container restart count after rollout: `0`
- Server-01 operational smoke: `PASS`
- Audit anchor continuity after deployment-key alignment: written successfully, failures `0`

The externally supplied mobile-publisher container was deliberately preserved during this rollout. The environment's
future image reference is pinned to the verified digest, while replacement of that external component remains a separate
controlled operation.

## Post-deployment media evidence

- Physical mobile WHIP publish: `PASS`, H264 and Opus, ten continuous samples, RTP loss `0`
- Synthetic account-authorized WHIP publish: `PASS`, VP8 and Opus
- Synthetic authorized WHEP playback: `PASS`, audio and video frames received
- WHEP answer latency: `47.5 ms`
- ICE connected latency: `71.9 ms`
- First audio frame: `173.2 ms`
- First video frame: `639.2 ms`, `640x360`
- Playback latency budget: `PASS`
- Test publisher/container cleanup: `PASS`
- Existing physical mobile publisher preserved after synthetic test: `PASS`

The legacy smoke path that requests publish authorization for a caller-selected stream ID is denied with `403`, as
required by the opaque server-owned routing policy. Follow-up automation must use the account publish-session API.

## Deployment order and gates

1. Record active mobile/WebRTC sessions and current container/image revisions.
2. Verify PostgreSQL backup and the previous immutable image digests.
3. Apply the auth-policy image and wait for Flyway V30, health, readiness, login, and authorization denial checks.
4. Replace media-control and verify Redis readiness, session binding, WHIP/WHEP, and Talkback denial paths.
5. Replace dashboard and backend stateless containers.
6. Confirm public TLS health/readiness, source revision, container health, and a mobile publish/playback smoke.

Stop the rollout on migration failure, failed readiness, authorization bypass, missing audit persistence, or source revision
mismatch. Roll back the affected application image only; keep the forward-compatible V30 schema and preserve evidence.

## Remaining blocked evidence

- Physical mobile Wi-Fi/LTE transitions: `BLOCKED` until coordinated device operation
- Physical screen-lock/background soak: `BLOCKED` until coordinated device operation
- MIL-STD-1472H Talkback intelligibility: `BLOCKED` pending real microphone/speaker and controlled acoustic conditions
- Controlled production rollout: `PASS`
- Production rollback rehearsal after this rollout: `NOT_RUN`; no failure required rollback
