# Release attestation plan

Every release shall bind source commit, builder identity, workflow revision, dependency lockfiles,
base-image digests, output image digests, SBOM hashes, vulnerability verdicts, tests, and deployment
evidence. CI produces SBOM and scan artifacts. The signed-release workflow is now configured to
publish digest-addressed GHCR images, create GitHub OIDC/Sigstore SLSA and SPDX attestations, sign
each digest with Cosign, and immediately verify its repository workflow identity. It remains
`CONFIGURED_NOT_RUN` until the protected `military-release` environment is configured and a run
produces retrievable evidence for all four images.

The target design uses a protected GitHub environment and OIDC/keyless signing or an approved
hardware-backed key. Production accepts only artifacts whose signature, identity, repository,
workflow, source revision, and transparency or private verification record match policy. The
workflow refuses to sign unless the five required CI checks already succeeded for the exact commit. Developer
workstation signatures cannot authorize a production release.

An exception requires a VEX record with exact component, status, exploitability rationale,
mitigation, owner, approver, expiry, removal condition, affected artifacts, and evidence. Expired or
ambiguous VEX records fail release.
