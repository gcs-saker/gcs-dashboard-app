# GCS-Saker hazard-closure qualification

This procedure reconciles the controlled hazard log, software level-of-rigor assignments,
top-level requirement traceability, verified control evidence, and residual-risk decisions. It
supports MIL-STD-882E Change 1 alignment; it is not an independent safety acceptance.

## Static contract

```bash
python scripts/reports/hazard_closure_qualification.py --check
```

The controlled baseline currently contains ten open hazards and the residual-risk register contains
no acceptance records. All hazards now have a top-level requirement trace, while the five hazards
added during the detailed control audit contain seven implemented, six partial, and two planned
controls. Therefore the truthful closure ratio remains zero and the result is `BLOCKED`.

## Closure inputs

Every hazard closure requires:

- a matching SwCI assignment and top-level requirement trace;
- every hazard safety requirement listed as a verified control;
- one or more supplied `PASS` evidence manifests bound to the exact source commit and hazard ID;
- a residual-risk rating other than `UNASSESSED`;
- an `ACCEPT` disposition, named acceptance authority, decision date, and future review date;
- hazard status `CLOSED` only after all prior conditions are satisfied.

Raw or sensitive evidence remains in the approved private evidence store. Git retains controlled
catalogues and non-sensitive manifest metadata only.

## Generate an immutable report

Use an explicit date so an assessment can be reproduced later. Supply each applicable evidence
manifest with a separate `--manifest` argument.

```bash
python scripts/reports/hazard_closure_qualification.py \
  --as-of-date 2026-09-15 \
  --manifest '<absolute-private-evidence-manifest.yml>' \
  --output '<new-absolute-private-hazard-closure-result.json>'
```

An open hazard produces `BLOCKED`. A hazard declared `CLOSED` with missing controls, mismatched
evidence, rejected risk, or expired acceptance produces `FAIL`. If every hazard closes technically,
the result still remains `BLOCKED` until the threshold and independent system-safety review are
approved. Output creation is exclusive and never overwrites prior evidence.

## Review order

1. Complete the partial and planned controls in `safety-control-catalogue.yml`.
2. Implement and verify every remaining safety requirement at its owning boundary.
3. Generate source-bound evidence manifests.
4. Assess residual risk; the developer does not self-accept it.
5. Obtain the named safety authority decision and review date.
6. Change hazard status to `CLOSED` only in the same reviewed change as its complete evidence links.
