# GCS-Saker change-impact qualification

This procedure measures how far a proposed adapter or module change spreads across production
ownership boundaries. It supports ISO/IEC 25010 maintainability evidence and ISO/IEC/IEEE 12207
change-control evidence; it is not a maintainability certification.

## Static contract

```bash
python scripts/reports/change_impact_qualification.py --check
```

The ownership catalogue recognizes six production boundaries: compatibility backend, auth-policy,
media-control, dashboard, contracts, and deployment. Tests, documentation, CI, and reusable scripts
are classified as non-production support. A new unclassified path fails closed until architecture
review assigns its owner.

## Compare immutable commits

The base must be an ancestor of the candidate. Use full commit references for retained evidence.

```bash
python scripts/reports/change_impact_qualification.py \
  --base-ref '<40-character-base-commit>' \
  --candidate-ref '<40-character-candidate-commit>' \
  --expected-owner media-control \
  --change-id '<issue-or-controlled-change-id>' \
  --output '<new-absolute-private-result.json>'
```

An in-boundary change is technically clean but remains `BLOCKED` until the proposed threshold and
independent evaluation are approved. Unknown paths fail. A change touching another production owner
is `REVIEW_REQUIRED` and `BLOCKED` until an exact disposition is supplied.

## Cross-boundary disposition

The private JSON disposition names the candidate commit, change ID, exact sorted cross-boundary
paths, reviewer, `ACCEPT` or `REJECT`, and rationale. An accepted review can make the technical
result clean, but cannot by itself create a conformance `PASS`. A rejected disposition produces
`FAIL`. Prior evidence is never overwritten.

Generated protocol files remain owned by their service or contract path; generated status does not
bypass ownership. Renames are evaluated as delete and add paths so moving a file across boundaries
is visible.
