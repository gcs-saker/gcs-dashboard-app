# License metadata remediation — 2026-09-14

## Scope

- Source SBOM run: `https://github.com/gcs-saker/gcs-dashboard-app/actions/runs/34299742864`
- Inputs: the four retained SPDX JSON image SBOMs from that run
- Decision basis: exact package URL and version; wildcard dependency resolutions are prohibited
- Metadata catalog: `docs/compliance/supply-chain/license-resolutions.yml`
- Legal exception inventory: `docs/compliance/supply-chain/license-approvals.yml`

The metadata catalog records factual license evidence only. Every resolved expression still passes
through the normal allow, deny, or legal-review policy. It does not grant a legal exception.

## Replay result

| Disposition | Before | After |
|---|---:|---:|
| ALLOWED | 136 | 138 |
| FIRST_PARTY | 2 | 6 |
| REVIEW_REQUIRED | 145 | 145 |
| UNKNOWN | 182 | 176 |
| DENIED | 0 | 0 |

The two newly allowed records are `blinker@1.9.0` and `grpcio@1.76.0`, resolved from their official
PyPI version metadata. The four OCI image records are now recognized as GCS-Saker first-party
artifacts by the existing registry and image-name namespace.

## Verdict

`BLOCKED`

This replay proves that exact metadata resolution works and remains fail-closed. It is not a new
signed release, and 176 unknown plus 145 review-required package records remain before a release can
pass the license gate.

## Current release replay

Signed release run `34805861025` evaluated commit
`2b44297d647ed3669e0ae509982f6afdba61551b` and remained `BLOCKED` before image signing:

| Image | ALLOWED | FIRST_PARTY | REVIEW_REQUIRED | UNKNOWN |
|---|---:|---:|---:|---:|
| backend | 43 | 1 | 87 | 36 |
| auth-policy | 59 | 2 | 15 | 102 |
| media-control | 7 | 2 | 10 | 30 |
| dashboard | 29 | 1 | 33 | 8 |

No production deployment occurred. The release workflow now uploads each image's complete JSON
disposition report and generated third-party notices before enforcing the gate, so future blocked
runs retain the exact package evidence needed for review.
