# GCS-Saker Security Assessment Report — initial baseline

## Assessment status

This is an initial internal assessment, not an authorization decision or certification. Automated
tests demonstrate existing authentication, scoped authorization, secret redaction, dependency and
image scanning, immutable release, backup, rollback, and health/denial controls. The imported ASD
STIG V6R4 source remains immutable. The assessment overlay currently records 11 Not a Finding,
274 Open, and 1 Not Applicable rule. Rules without approved evidence fail closed as Open rather than
remaining implicitly unassessed. On 2026-10-16 the exact official V6R4 XCCDF was restored
from the DISA January 2026 compilation; its hash matches the original checklist baseline.
All 286 rules and 319 CCI references are bound to retained bytes, and the 14 assessment entries
now use exact source CCI lists. This resolves POAM-SEC-007, not the 274 Open assessments or
the wider CA-2 assessment. See `../evidence/asd-stig-v6r4-cci-restoration-2026-10-16.md`.

## Initial findings

- Internal gRPC mTLS, MQTT client identity, System Administrator MFA, and short-lived TURN credentials
  are implemented but not deployed or enrolled on Server-01.
- PostgreSQL and Redis encryption still require a controlled target profile.
- Artifact and SBOM signatures, SLSA provenance, and license policy have internal release evidence;
  future exceptions still require time-bounded VEX records.
- Audit hash-chain and recovery evidence exist; independent WORM retention remains incomplete.
- Internal DAST and fuzzing evidence exist; independent penetration evidence remains incomplete.
- AI analysis remains intentionally unavailable until stream/session/group binding is server-owned.

These findings are not accepted risk. They are tracked in `poam.yml` and the linked M12 issues.
