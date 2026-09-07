# Secure update and recovery runbook

Security updates follow the same immutable release path as normal production changes and never bypass
CI, backup, health, authorization-denial, container revision, or rollback checks. Emergency priority
shortens response time; it does not remove evidence or expand the authorized deployment target beyond
Server-01 on SSH 55121.

Before change, identify affected versions from SBOM and inventory, preserve the report, assess active
exploitation, revoke or rotate exposed credentials, create regression tests, and build the release from
a reviewed immutable commit. Stateful migration requires a verified backup and restore listing.

A closed-network update bundle contains signed manifest, images, SBOM, VEX, migration inventory,
checksums, an offline verification tool, and installation/rollback instructions. Installation rejects
an invalid signer, digest, target profile, source revision, or expired authorization without requiring
Internet access.

After deployment, verify public health/readiness, unauthenticated and unauthorized denial, application
container health, image source revision, absence of new 5xx/restart/OOM signals, audit events, and
stateful-service identity. A failed gate invokes the captured rollback and records FAIL, not PASS.

Every 90 days, rehearse credential compromise, emergency dependency update, rollback, corrupted backup,
and invalid offline bundle rejection. Findings become corrective issues and POA&M entries with owner and
due date.

