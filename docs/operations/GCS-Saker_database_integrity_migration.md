# Database membership, UTC and telemetry identity migration

## Authority and invariants

Auth Policy's `auth_users.group_id/role` and `registered_devices.group_id` remain authoritative. V34 ensures that their primary memberships exist and match those fields inside the same transaction. Membership triggers maintain the primary rows; deferred foreign keys reject deletion or role mismatch at commit. Additional legacy membership rows remain stored but do not grant access under the current policy. No multi-group authorization feature is enabled.

User membership names widen from 50 to 128 characters to match the owning identity table. Orphan users/groups block migration instead of being erased. Role, group-type/status and device-type/status constraints reflect the current domain enums. User writes now have explicit transactions and three-second bounds; group moves and administrator replacement keep their existing external behavior. PostgreSQL error logs omit row details and bound parameters.

## UTC conversion

V35 converts only owned naive timestamp columns in the active Flyway schema. Historical naive values must represent UTC as required by the existing contract; verify that provenance before a production migration. If a local-time producer existed, stop for a reviewed zone-specific plan.

The migration sets its transaction timezone to UTC and changes columns to unqualified `TIMESTAMPTZ`, preserving stored instants while using PostgreSQL's default microsecond precision for future writes. Explicit `TIMESTAMPTZ(3)` caused a heap rewrite in the PostgreSQL 16 experiment; removing that typmod preserved the heap file. Already-qualified audit timestamps are untouched, so audit hashes retain their established storage precision. Related indexes can still need rebuilding and exclusive DDL locks are bounded to two seconds, with a thirty-second statement limit.

PostgreSQL's UTC binary-coercion optimization is documented in the [upstream change](https://www.postgresql.org/message-id/E1h2TU0-00059a-Ds%40gemulon.postgresql.org). Local integration tests also compare relation file nodes and verify the same instant while reading in Asia/Seoul.

## Staged history identity

V36 prevents new NULL history identities with a `NOT VALID` check and a default for direct/seed inserts. The persistence boundary assigns an opaque server receipt ID when a legacy client omits `eventId`. Existing clients need no new input; supplied modern event IDs retain replay deduplication. Receipt IDs do not retroactively make legacy retries idempotent. Latest/history row mapping now retains the identifier.

Old NULL rows are processed by `scripts/ops/telemetry_identity_backfill.py` in bounded transactions using `FOR UPDATE SKIP LOCKED`. Values other than identity are preserved. When no NULL rows remain, explicit finalization validates the check, sets NOT NULL and adopts the existing unique index as the primary key. Finalization is idempotent and never drops an unexpected existing primary key.

The command defaults to read-only `--check`. A successful check is not release readiness: require `complete=true` and `primaryKeyReady=true`. `--run` returns exit 3 if more batches or finalization remain. Bounds default to 1,000 rows and ten batches; limits are 10,000 rows and 1,000 batches, with a ten-second statement timeout and two-second lock timeout. An incomplete finalization fails without weakening the constraint.

Production mutation requires all of the following:

- `DEPLOYMENT_TARGET=server01-production` and `GCS_MAINTENANCE_WINDOW_APPROVED=1`.
- A protected `DATABASE_URL_FILE` with verify-full TLS and a CA path.
- `GCS_DB_BACKUP_EVIDENCE` pointing to the owner-only `drill-result.json` produced by `scripts/ops/backup_rollback_drill.sh`, alongside its owner-only `database.dump`.
- Matching archive SHA-256, restore verification and table counts, source revision, and a proof no older than 24 hours.

Use an authorized operations environment with Psycopg and both sibling maintenance modules available. An ephemeral operations container may mount the approved release's `scripts/ops` read-only; it must use the private control network and protected DSN/CA/backup mounts, not publish a database port. The named runtime secret group is 10050; any group-readable secret must match that configured runtime ACL and the process group. The local-fixture override accepts only named disposable databases on loopback or the test `postgres` alias.

```bash
python scripts/ops/telemetry_identity_backfill.py --check
python scripts/ops/telemetry_identity_backfill.py --run --batch-size 1000 --max-batches 10
python scripts/ops/telemetry_identity_backfill.py --run --finalize
```

No production migration is executed by the test suite. Test results cover primary membership moves and rejection, an orphan upgrade failure without deletion, UTC instant/heap preservation, legacy receipt assignment, bounded/resumable backfill, PK finalization/replay, and rejection of invalid backup/maintenance/target inputs. Large-table production lock duration and backfill throughput remain measurements for #920 and the final approved deployment.
