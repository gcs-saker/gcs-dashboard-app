# Frontend unused-dependency qualification — 2026-09-22

- Related issue: `#663`
- Result: `PASS`
- Production deployment: `NOT_RUN`

Knip identified `@emnapi/core` and `@emnapi/runtime` as unused direct development dependencies.
Both are already owned transitively by the Rolldown WASM fallback and are not imported or invoked by
the dashboard. Removing the redundant top-level declarations preserves the transitive copies selected
by the lockfile while reducing direct dependency ownership.

The removal was first exercised in an isolated Docker copy. All 161 frontend test files and 586 tests
passed, followed by TypeScript checking and the production Vite build. The repository then added a
pinned Knip development tool and a dependency-only CI command. The command intentionally checks
dependencies, unlisted imports, binaries, and catalog entries while excluding unused exports and files;
those categories include public contracts, test harness exports, generated output, and Sass partials
and require separate code-ownership review before deletion.
