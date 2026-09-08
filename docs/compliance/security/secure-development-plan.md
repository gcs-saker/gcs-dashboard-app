# GCS-Saker Secure Development Plan

## Purpose and authority

This plan implements NIST SP 800-218 SSDF 1.1 across the software lifecycle and aligns its
records with ISO/IEC/IEEE 12207. It applies to source, contracts, dependencies, build pipelines,
deployment configuration, operational scripts, tests, documentation, and AI-assisted changes.

## PO — Prepare the Organization

- Product security owns the secure-development profile and vulnerability disposition.
- Boundary owners are declared in `.github/CODEOWNERS`; protected changes require their review.
- The repository `AGENTS.md` files define mandatory coding, authorization, privacy, and verification constraints.
- Security requirements use stable `MR-*` identifiers and the military-ready traceability gate.
- Production access, GitHub administration, signing identities, and CI credentials use named accounts and MFA.
- Development, CI, and production credentials are separate. Shared production accounts are prohibited.
- Security training covers authentication, object authorization, secrets, cryptography, dependency risk, and incident reporting.

## PS — Protect the Software

- Main is protected; direct push, force push, and merge without required CI are prohibited.
- Source changes are reviewed and traceable to an issue and immutable commit.
- Secrets, controlled data, production telemetry, private media routes, and customer data are prohibited in prompts, fixtures, commits, logs, and public artifacts.
- Lockfiles, exact dependency versions, container digests, SBOMs, vulnerability scans, and license review protect third-party components.
- CI and release identities use least privilege. Build outputs are not accepted from developer workstations as production artifacts.
- Release evidence records source revision, image digest, environment hash, migration inventory, and verification result.

## PW — Produce Well-Secured Software

- A change that adds or alters a trust boundary, listener, endpoint, topic, credential, role, group scope, media route, command, model, or persistence record documents its security impact.
- Inputs are validated at the first owned boundary. Authorization uses server-owned resource identity and fails closed.
- Authentication, group policy, stream routing, Talkback, waypoint, AI, deployment, and migration changes require successful and negative tests.
- Network, database, broker, and external processor operations have explicit timeouts and bounded retries.
- Sensitive errors are translated before leaving the owning service. Secrets and private routes are never logged.
- SAST-style repository gates, linters, type checkers, unit/integration tests, dependency audits, SBOM generation, and image scans are release blockers.
- Generated code and AI-assisted code receive the same ownership, review, testing, provenance, and license checks as human-authored code.

## RV — Respond to Vulnerabilities

- Reports are triaged by exploitability, mission impact, affected versions, exposure, and available mitigation.
- Critical and actively exploited findings are emergency work; supported High findings block release unless an approved exception exists.
- Every exception names the vulnerability, component, rationale, mitigation, owner, approver, expiry, and removal condition.
- Fixes include regression tests and root-cause analysis for repeatable defect classes.
- Affected releases, SBOMs, advisories, rollback or update instructions, and residual risk remain traceable.
- Incident evidence is preserved without copying credentials, controlled data, or raw private media into public systems.

## Mandatory security-impact review

The pull request template is mandatory when a change affects any of these boundaries:

- identity, tokens, roles, groups, membership, or authorization;
- stream discovery, playback, publish, Talkback, or media route construction;
- waypoint, geofence, device command, MQTT, or gRPC;
- AI processor, model artifact, frame binding, overlay, or automated decision;
- secrets, certificates, encryption, logging, audit, persistence, migration, backup, deployment, or CI.

The author records the changed trust boundary, attacker-controlled inputs, data classification,
authentication and authorization effect, secret and logging effect, dependency effect, negative
tests, threat/hazard links, runtime impact, rollback, and evidence location.

## AI-assisted development

- Never provide operational secrets, private keys, credentials, controlled technical data, customer data, raw production logs, or private media to an unapproved AI service.
- Treat generated source, tests, dependencies, shell commands, configuration, and security claims as untrusted until reviewed and verified.
- Do not accept generated cryptography, authentication, authorization, safety logic, or destructive operations without named owner review and negative tests.
- Verify license and provenance before incorporating generated or retrieved material.
- AI-generated tests cannot be the sole evidence for the behavior they were generated to validate.

## Records and review

Compliance records use the manifest-plus-artifact policy. This plan is reviewed every 90 days,
after a security incident, after a material trust-boundary change, or when the governing SSDF,
STIG, RMF, or lifecycle baseline changes.

