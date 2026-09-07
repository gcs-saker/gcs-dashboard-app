# Qualification Evidence Package

Each candidate release produces a package containing the profile revision, requirement catalog,
traceability result, threat model, attack-surface inventory, hazard/LOR records, STIG checklist,
RMF matrix, POA&M, voice results, AI assurance state, supply-chain state, test manifests, SBOMs,
scan results, image digests, deployment evidence, waivers, residual risk, and known limitations.

Every generated manifest records the full source commit, workflow identity, tool versions,
environment, timestamps, artifact SHA-256 values, verdict, and reviewer. Large or controlled raw
artifacts remain in the approved evidence store and are referenced by immutable locator and hash.

Delta qualification compares changed requirements, trust boundaries, hazards, interfaces,
dependencies, migrations, and tests with the previously qualified release. A changed safety or
security requirement invalidates inherited PASS evidence until impact analysis and required retest
complete. Missing and expired evidence becomes BLOCKED, never PASS.

Claims distinguish certified, conformant, aligned, assessed, and ready according to the profile.
The package always includes open findings, NOT_RUN work, BLOCKED physical tests, waivers, and
residual risk rather than reporting only successful evidence.

