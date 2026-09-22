# GCS-Saker audit anchor verification

## Purpose

Verify the complete audit-anchor directory before backup, offload, restore, key rotation, or deployment. Verification is
read-only and must run before an application is allowed to extend an existing anchor chain.

## Command

Keep the HMAC key outside the repository with owner-only permissions, then run:

```bash
python3 scripts/ops/audit_anchor_verify.py \
  --anchor-directory /absolute/private/audit-anchors \
  --hmac-key-file /absolute/private/audit-anchor.key \
  --checkpoint-file /independent/read-only/latest-anchor-checkpoint.json \
  --expected-source-commit <immutable-source-commit>
```

Omit `--expected-source-commit` only when verifying a chain that intentionally spans multiple application revisions.
The verifier reports only the anchor count; it does not print hashes, paths, credentials, or event content.

## Fail-closed checks

- filenames and embedded sequence numbers start at one and remain contiguous;
- every `previousAnchorHash` points to the prior signed anchor;
- the canonical payload hash and HMAC-SHA-256 signature match;
- record counts and timestamps never regress;
- the optional immutable source commit matches;
- the HMAC key is at least 32 bytes and is not group/world accessible.
- the independently retained latest sequence/hash checkpoint prevents tail truncation or rollback.

Missing, reordered, malformed, payload-tampered, re-signed-with-an-unapproved-key, or permission-unsafe evidence is a
`FAIL`. Do not delete or rewrite the affected anchor. Preserve the directory read-only, record the failure, restore the
last independently offloaded copy, and run `verify_audit_recovery.py` against the restored database export.

## Assurance boundary

This software verifier provides tamper evidence and recovery comparison. It does not turn ordinary local storage into
external immutable or certified WORM storage. That infrastructure requirement remains open in the audit integrity policy.

## Offload and restore rehearsal

Use new empty directories on independently mounted storage. The runner refuses same-device offload and evidence
overwrite, selects the highest anchor sequence rather than file modification time, installs the offloaded anchor as
read-only, restores the audit export with an exclusive create, and verifies chain equality plus the signed anchor.

```bash
python3 scripts/ops/audit_offload_restore_drill.py \
  --original-export /private/source/audit.jsonl \
  --anchor-directory /private/source/anchors \
  --hmac-key-file /private/keys/audit-anchor.key \
  --external-directory /independent/worm-staging/anchors \
  --restore-directory /isolated/restore \
  --evidence-output /isolated/evidence/audit-drill-result.json
```

The result contains only status, counts, sequence, UTC completion time, and SHA-256 evidence digests. Paths, event
contents, credentials, and private routes are not recorded. An isolated Docker rehearsal may use separate tmpfs mounts
to exercise the workflow, but it is not evidence that an operational external WORM service has been deployed.
