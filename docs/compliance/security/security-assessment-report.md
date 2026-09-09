# GCS-Saker Security Assessment Report — initial baseline

## Assessment status

This is an initial internal assessment, not an authorization decision or certification. Automated
tests demonstrate existing authentication, scoped authorization, secret redaction, dependency and
image scanning, immutable release, backup, rollback, and health/denial controls. The imported ASD
STIG V6R4 source remains immutable. The assessment overlay currently records 9 Not a Finding,
276 Open, and 1 Not Applicable rule. Rules without approved evidence fail closed as Open rather than
remaining implicitly unassessed. CCI identifiers remain blocked because the retained
official-source extraction omitted them; NIST control mappings and evidence are recorded without
inventing CCI values.

## Initial findings

- Internal gRPC mTLS, MQTT client identity, System Administrator MFA, and short-lived TURN credentials
  are implemented but not deployed or enrolled on Server-01.
- PostgreSQL and Redis encryption still require a controlled target profile.
- Artifact and SBOM signatures, SLSA provenance, VEX, and license policy are incomplete.
- Audit tamper evidence and long-term retention are incomplete.
- DAST, fuzzing, and independent penetration evidence are incomplete.
- AI analysis remains intentionally unavailable until stream/session/group binding is server-owned.

These findings are not accepted risk. They are tracked in `poam.yml` and the linked M12 issues.
