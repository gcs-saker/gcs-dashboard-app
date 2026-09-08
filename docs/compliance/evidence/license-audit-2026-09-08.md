# Runtime image license audit — 2026-09-08

## Source

- Signed release run: `https://github.com/gcs-saker/gcs-dashboard-app/actions/runs/34187037305`
- Inputs: four retained SPDX JSON image SBOMs
- Scanner: `scripts/reports/license_compliance.py`
- Policy: `docs/compliance/supply-chain/supply-chain-policy.yml`
- Approval inventory: empty; no legal approval was inferred

## Initial result

| Disposition | Package records |
|---|---:|
| ALLOWED | 136 |
| FIRST_PARTY | 2 |
| REVIEW_REQUIRED | 145 |
| UNKNOWN | 182 |
| DENIED | 0 |

The count is by SBOM package record, not unique dependency. Base operating-system packages can carry
compound license expressions and the same component can occur in more than one image.

## Verdict

`BLOCKED`

No explicitly denied AGPL, SSPL, or BUSL expression was detected by the first pass. Release license
enforcement cannot pass because 182 records lack a usable declaration or use an unresolved
`LicenseRef`, and 145 records require legal or distribution-obligation review. `NOASSERTION` is not
treated as permissive. The scanner generated notices in a temporary evidence workspace, but those
notices are not approved delivery artifacts until the dispositions are resolved.

## Next actions

1. Resolve Maven metadata gaps from authoritative POM/license sources.
2. Separate operating-system package obligations from linked application-library obligations.
3. Review GPL/LGPL and custom expressions for image redistribution requirements.
4. Record exact purl, expression, approver, expiry, and obligation in `license-approvals.yml`.
5. Enable `--enforce` in the signed-release workflow only when UNKNOWN and REVIEW_REQUIRED reach zero.
