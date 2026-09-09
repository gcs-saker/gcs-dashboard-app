# Release attestation plan

Every release shall bind source commit, builder identity, workflow revision, dependency lockfiles,
base-image digests, output image digests, SBOM hashes, vulnerability verdicts, tests, and deployment
evidence. CI produces SBOM and scan artifacts. The signed-release workflow is now configured to
publish digest-addressed GHCR images, create GitHub OIDC/Sigstore SLSA and SPDX attestations, sign
each digest with Cosign, and immediately verify its repository workflow identity. A final signed
manifest binds all four digest references to the source commit, SBOM hashes, license reports, and
third-party notices.

The workflow also runs the repository-owned SPDX license classifier and retains a per-image JSON
disposition plus generated third-party notice. Enforcement is fail-closed: unresolved
`NOASSERTION`, denied licenses, or review-required expressions prevent a deployable manifest from
being produced. Current license remediation therefore remains a release prerequisite.

The target design uses a protected GitHub environment and OIDC/keyless signing or an approved
hardware-backed key. Production accepts only artifacts whose signature, identity, repository,
workflow, source revision, and transparency or private verification record match policy. The
workflow refuses to sign unless the five required CI checks already succeeded for the exact commit. Developer
workstation signatures cannot authorize a production release.

An exception requires a VEX record with exact component, status, exploitability rationale,
mitigation, owner, approver, expiry, removal condition, affected artifacts, and evidence. Expired or
ambiguous VEX records fail release.

Server-01 deployment never rebuilds application images. It verifies the signed manifest, image
signature, SLSA provenance, and SPDX attestation, then pulls the four approved digest references.
