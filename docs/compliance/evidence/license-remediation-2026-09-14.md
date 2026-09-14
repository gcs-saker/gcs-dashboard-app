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

Release run `34806907389` did not reach license evaluation because the newly added evidence upload
action referenced an invalid immutable revision. The workflow remained fail-closed, and no image
was signed or deployed. The reference was corrected to the repository's existing pinned
`actions/upload-artifact` v5 revision.

## Retained release evidence

Signed release run `34807696915` evaluated commit
`930d2664e68960c795f8d1025eda172b710bff27`. All four image jobs retained their JSON disposition
reports and generated notices before enforcement. The counts remained unchanged from run
`34805861025`; no image or release manifest was signed, and no production deployment occurred.

Across the reports, 321 package records require action and 315 remain after exact package,
version, license, and disposition deduplication:

| Ecosystem | REVIEW_REQUIRED | UNKNOWN |
|---|---:|---:|
| Alpine APK | 54 | 9 |
| Debian DEB | 83 | 21 |
| Go modules | 0 | 30 |
| Maven | 0 | 100 |
| PyPI | 4 | 8 |
| Generic / unavailable PURL | 0 | 2 |

PyPI version metadata for `protobuf@6.33.6` explicitly identifies the license as the 3-Clause BSD
License. Its exact PURL is therefore resolved to `BSD-3-Clause`; this is factual metadata
remediation, not a legal exception.

Version-pinned upstream license files also resolve `itsdangerous@2.2.0` and `jinja2@3.1.6` to
`BSD-3-Clause`. The `uvloop@0.22.1` upstream release contains both MIT and Apache 2.0 license files
and identifies the package as dual-licensed, so its effective expression is
`MIT OR Apache-2.0`. The remaining PyPI records have ambiguous, exceptional, or multi-part terms
and remain blocked for further review.

## Maven remediation batch 1

The 100 Maven `UNKNOWN` records were queried by exact group, artifact, and version against their
version-pinned Maven Central POMs. The initial inventory produced 57 POMs with explicit licenses,
16 without a direct license declaration, and 27 coordinates that did not resolve because the SBOM
group field is malformed or synthetic.

Batch 1 records 15 exact PURL resolutions whose POMs declare Apache-2.0 or MIT. Replaying the
auth-policy SBOM changes `ALLOWED` from 59 to 74 and `UNKNOWN` from 102 to 87. No wildcard,
inherited-license assumption, or legal exception was introduced.

Batch 2 records another 15 exact Maven PURLs with direct Apache-2.0 or MIT declarations. One PURL
occurs in more than one SBOM package record, so the auth-policy replay changes `ALLOWED` from 74 to
90 and `UNKNOWN` from 87 to 71. The same fail-closed constraints remain in effect.

Batch 3 records the final 19 exact Maven PURLs whose version POM directly declares Apache-2.0 or
MIT. The auth-policy replay changes `ALLOWED` from 90 to 109 and `UNKNOWN` from 71 to 52. All
remaining Maven records now require coordinate repair, parent-POM evidence, or explicit policy
review; none are eligible for automatic allowlisting from their current SBOM metadata.
