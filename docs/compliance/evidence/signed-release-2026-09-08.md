# Signed release evidence — 2026-09-08

## Identity

- Source commit: `3b0eaa4beadc5c3301606731fc8f4c36a8553f2f`
- Source CI: `https://github.com/gcs-saker/gcs-dashboard-app/actions/runs/34186671664`
- Signed release run: `https://github.com/gcs-saker/gcs-dashboard-app/actions/runs/34187037305`
- Builder identity: GitHub Actions workflow `release-supply-chain.yml`
- Signing identity: GitHub OIDC short-lived Sigstore certificate
- Registry: GitHub Container Registry

The `military-release` environment accepts only `main` and `v*` deployment refs. Repository-plan
configuration does not currently enforce an independent required reviewer, so reviewer protection
is not claimed by this evidence.

## Subjects

| Artifact | Immutable digest | Cosign | SLSA provenance | SPDX SBOM attestation |
|---|---|---|---|---|
| backend | `sha256:036594b915bf7d7d7eb39c45c4c7f24d9e97a673e5bed22c17bccf43691c67fc` | PASS | PASS | PASS |
| auth-policy | `sha256:29cbaac5c73291125bb9b9f0fc65cd00883da8b6d9da8a03c42f7f929066b236` | PASS | PASS | PASS |
| media-control | `sha256:3aa0066ec41c9bc5775aeb6f94dc3d14447b64feb203c98d4dcf917a5335ee67` | PASS | PASS | PASS |
| dashboard | `sha256:5395400966f94a00f311551f0a18a25e42da3727749a6d78d91978420c9ab66f` | PASS | PASS | PASS |

Each workflow job signed the digest and immediately ran Cosign verification constrained to this
repository, workflow path, Git ref class, and the GitHub Actions OIDC issuer. A separate verification
using `gh attestation verify` retrieved and verified both the SLSA provenance predicate and the
`https://spdx.dev/Document/v2.3` predicate for all four OCI subjects.

## Evidence artifacts

The workflow retained a Cosign bundle and SPDX JSON file per image for 90 days. GitHub also retained
the generated SBOM artifacts and build records. Artifact enumeration after completion found all four
signed-release evidence bundles and all four release SBOMs without expiration.

## First-run finding

The first release run built and pushed all images, generated both attestations, and signed each image,
but failed verification because Cosign v3 no longer accepts `verify --bundle`. PR #670 removed that
obsolete verification flag while keeping the bundle as downloadable evidence. The corrected workflow,
its exact merge-commit CI, and the second signed release run all passed.

## Remaining scope

- License allowlist/denylist enforcement and generated third-party notices remain OPEN.
- Release deployment does not yet consume GHCR digests or block unsigned images; Server-01 still uses
  locally built source-revision-labelled images.
- VEX is required for exceptions, but no signed release VEX attachment was needed or produced in this run.
