# Release attestation plan

Every release shall bind source commit, builder identity, workflow revision, dependency lockfiles,
base-image digests, output image digests, SBOM hashes, vulnerability verdicts, tests, and deployment
evidence. CI currently produces SBOM and scan artifacts, while signing and SLSA-style provenance
remain OPEN because the release registry and trusted signing identity have not been selected.

The target design uses a protected GitHub environment and OIDC/keyless signing or an approved
hardware-backed key. Production accepts only artifacts whose signature, identity, repository,
workflow, source revision, and transparency or private verification record match policy. Developer
workstation signatures cannot authorize a production release.

An exception requires a VEX record with exact component, status, exploitability rationale,
mitigation, owner, approver, expiry, removal condition, affected artifacts, and evidence. Expired or
ambiguous VEX records fail release.

