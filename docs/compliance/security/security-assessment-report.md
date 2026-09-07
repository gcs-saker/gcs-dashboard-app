# GCS-Saker Security Assessment Report — initial baseline

## Assessment status

This is an initial internal assessment, not an authorization decision or certification. Automated
tests demonstrate existing authentication, scoped authorization, secret redaction, dependency and
image scanning, immutable release, backup, rollback, and health/denial controls. The imported ASD
STIG V6R4 checklist remains NOT_RUN pending rule-by-rule tailoring.

## Initial findings

- Internal gRPC uses a private but non-mTLS transport profile.
- MQTT, PostgreSQL, and Redis encryption and client identity require a controlled target profile.
- System Administrator MFA is not implemented.
- TURN credentials are not yet session-specific and short-lived.
- Artifact and SBOM signatures, SLSA provenance, VEX, and license policy are incomplete.
- Audit tamper evidence and long-term retention are incomplete.
- DAST, fuzzing, and independent penetration evidence are incomplete.

These findings are not accepted risk. They are tracked in `poam.yml` and the linked M12 issues.

