# Maven license evidence collection — 2026-09-17

## Scope

- Input: auth-policy license report from signed release run `35182450271`
- Collector: `scripts/reports/maven_license_evidence.py`
- Repository: exact-version Maven Central POMs
- Parent traversal: bounded to three levels with 10-second request timeouts

## Result

The collector evaluated all 51 unresolved Maven coordinates:

- 49 coordinates had direct or inherited POM license evidence.
- 48 were normalized to recognized SPDX expressions.
- `aopalliance:aopalliance:1.0` remains manual review because its POM declares only `Public Domain`.
- `jrt-fs:jrt-fs:21.0.12` is not a Maven Central artifact and must be resolved from the Corretto JDK distribution evidence.
- `spring-boot-jarmode-tools:spring-boot-jarmode-tools:3.5.15` is a synthetic SBOM coordinate and must be reconciled to its canonical Spring Boot coordinate before resolution.

Review-sensitive expressions such as EPL-2.0, EDL-1.0, LGPL, CC0, MIT-0, and GPL with the
Classpath exception are normalized but not added to the global allowlist. This evidence is an input to
the exact-PURL resolution catalogue and is not itself a legal approval.

## Exact-PURL catalogue replay

Two reviewed batches added 46 exact Maven coordinates to the resolution catalogue. Docker replay of
the same auth-policy SBOM changed the complete report to `ALLOWED: 148`, `FIRST_PARTY: 2`,
`REVIEW_REQUIRED: 25`, and `UNKNOWN: 3`. The remaining unknowns are AOP Alliance Public Domain,
Corretto `jrt-fs`, and the Alpine `libmd` OS package. Review-sensitive Maven licenses are now visible
as `REVIEW_REQUIRED` instead of being hidden inside `UNKNOWN`.
