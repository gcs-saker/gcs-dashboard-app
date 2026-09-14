# Server-01 recovery qualification

This procedure qualifies one controlled service interruption at a time. It is not a deployment
procedure and never targets Server-02. Do not run it without an approved maintenance window and a
verified backup/restore result for the exact candidate commit.

## Preflight

1. Confirm the candidate commit is merged to `main` and its CI is successful.
2. Run `scripts/ops/backup_rollback_drill.sh` in the private Server-01 release checkout.
3. Confirm public health, readiness, and unauthenticated denial before the window.
4. Create a new owner-only absolute evidence directory. Never reuse a previous result path.
5. Record the maintenance approval identifier outside source control.

The non-mutating contract check is:

```bash
python scripts/ops/recovery_qualification.py --check
```

## Execute one scenario

Set the private environment paths on Server-01 and select exactly one scenario from
`docs/compliance/quality/recovery-qualification-profile.yml`.

```bash
export DEPLOYMENT_TARGET=server01-production
python scripts/ops/recovery_qualification.py \
  --target server01-production \
  --scenario RQ-REDIS \
  --approved-window '<approval-id>' \
  --env-file '<absolute-private-env-file>' \
  --backup-result '<absolute-backup-drill-result.json>' \
  --evidence-dir '<absolute-owner-only-evidence-directory>'
```

The runner verifies the backup result and healthy public baseline before stopping anything. It uses
Compose `stop` and `start`, never `down`, `rm`, or forced recreation. A `finally` recovery path starts
the same container if the primary recovery path fails. Container identity and all public probe
results are recorded. Run PostgreSQL, Redis, MQTT, MediaMTX, auth-policy, and media-control in
separate windows or sequentially after each prior result is reviewed.

## Accepted-record reconciliation

Capture acknowledged idempotency IDs immediately before injection and query the authoritative store
after recovery. Both private JSON inputs use this structure and the exact candidate commit:

```json
{
  "schemaVersion": "gcs-saker.record-id-set.v1",
  "sourceCommit": "0000000000000000000000000000000000000000",
  "ids": ["example-id"]
}
```

Generate the immutable reconciliation result:

```bash
python scripts/ops/recovery_qualification.py --reconcile \
  --accepted '<absolute-accepted-ids.json>' \
  --recovered '<absolute-recovered-ids.json>' \
  --output '<new-absolute-result.json>'
```

Missing, duplicate, and unexpected IDs produce `FAIL`. A technically clean result remains `BLOCKED`
until the proposed thresholds and independent evaluator are approved. Raw IDs, environment files,
logs, backups, credentials, private addresses, and private media routes remain outside Git.

## Abort and escalation

- If preflight probes fail, do not inject a fault.
- If recovery exceeds 120 seconds, keep collecting evidence and mark the technical result failed.
- If the container ID changes, stop the campaign and investigate unapproved recreation.
- If public authorization denial changes from 401, treat it as a security incident.
- Do not proceed to the next scenario until health, readiness, and denial are restored.
