# Runtime lifecycle gate expansion — 2026-09-22

- Related issue: `#663`
- Result: `PASS`
- Production deployment: `NOT_RUN`

The lifecycle gate now compares every declared Node, Python, Java, and Go runtime found in CI,
Dockerfiles, language version files, and build configuration against the minimum-supported policy.
It fails when a runtime is absent, below the minimum, or on a denied major.

The media-control CI job also runs `go mod tidy -diff`. This fails when direct or indirect module
requirements are stale, missing, or no longer used by the source and tests. The check does not modify
the working tree and therefore preserves reviewable dependency changes.

Focused Docker verification covered the current policy and one rejection case for each of the four
runtime families. Broader unused-dependency analysis for Python, Java, and JavaScript remains a
separate follow-up because import-only scanners require explicit framework and build-tool handling to
avoid classifying runtime plugins, annotation processors, and bundler entry points as unused.
