# Java and Kotlin dependency ownership — 2026-09-22

- Related issue: `#663`
- Result: `PASS`
- Production deployment: `NOT_RUN`

Every direct auth-policy Gradle dependency now has an owned configuration and a concrete runtime,
compile-time, or test purpose. CI compares the build script with this inventory and fails for an
unowned declaration, a stale inventory entry, a duplicate entry, or a missing reason.

The Autonomous Apps dependency analysis plugin was evaluated first in the Windows-hosted Docker
environment. The attempt stopped with a `StackOverflowError` during protobuf generation. The same
failure persisted after removing the plugin and running a clean build, so it is classified as a local
bind-mount/toolchain limitation rather than attributed to the plugin or product. The plugin was not
adopted, and no dependency was deleted from incomplete heuristic output. Required Linux CI remains
the authoritative auth-policy build and test result.

The inventory explicitly retains framework-discovered and runtime-only dependencies such as the
PostgreSQL driver, Flyway dialect, Prometheus registry, Spring Modulith annotations, and Kotlin
reflection. These cannot be classified safely by source-import matching alone.
