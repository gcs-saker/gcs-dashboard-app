# GCS-Saker repository working agreement

## Scope and deployment

- Server-01 production on SSH port 55121 is the only managed runtime.
- Server-02/55122 must not be probed, deployed, restarted, or used as a fallback.
- Production changes must pass CI and be traceable to one immutable source commit before deployment.
- Stateful services require a verified backup and sequential health checks before intentional recreation.

## Architecture boundaries

- `backend/` owns the Python compatibility API and adapters.
- `services/auth-policy/` owns identity, authorization, group policy, token lifecycle, and operational reads.
- `services/media-control/` owns stream discovery, opaque publish/playback sessions, gRPC gateway handling, and Redis session state.
- `gcs-dashboard/` owns browser presentation and interaction; it must not derive private media routes or authorization policy.
- `contracts/` owns cross-process protocol contracts. Do not duplicate field numbers, route strings, or enums in ad-hoc clients.
- `deploy/` owns deployable configuration. `scripts/` contains reusable automation only; one-off document generators do not belong in the repository.

## Naming and size

- Python modules, variables, and functions use `snake_case`; classes and exceptions use `PascalCase`, and exceptions end in `Error`.
- Go follows `gofmt` and standard Go naming. Kotlin files and public types use `PascalCase`; local values and functions use `camelCase`.
- React component files use `PascalCase`; hooks start with `use`; non-component TypeScript modules use `camelCase`.
- External camelCase JSON and legacy database names are represented with explicit aliases at the boundary, not leaked into Python identifiers.
- Production source files must stay below 350 lines. Split responsibilities before adding more behavior.

## Security and privacy

- UUIDs, credentials, bearer/renewal/publish tokens, cookies, private routes, and raw query secrets must not be logged.
- Clients select opaque stream IDs. Group membership and actual media routing remain server-owned.
- Secret files are never committed and must be owner-only, except for an explicitly verified named runtime ACL.
- Public ingress is TLS on the production edge; internal databases, Redis, MQTT, metrics, reflection, and actuator endpoints remain private.

## Repository hygiene

- Canonical automation lives in `scripts/smoke`, `scripts/ops`, `scripts/gates`, `scripts/benchmarks`, `scripts/reports`, or `scripts/github`.
- Root script compatibility entrypoints contain delegation only and no implementation logic.
- IDE metadata, caches, generated builds, reports, credentials, certificates, and local agent state are ignored and never tracked.
- Do not keep duplicate implementations or unused compatibility files without a documented consumer and removal plan.

## Verification

- Changes must include proportionate tests and must pass formatting, lint, type checking, unit/integration tests, builds, and repository contracts.
- Security or routing changes require negative authorization tests as well as the successful path.
- Runtime validation records `PASS`, `FAIL`, `BLOCKED`, or `NOT_RUN` with evidence. Missing physical equipment is `BLOCKED`, never `PASS`.
- A deployment is complete only after public health/readiness, authorization denial, container health, and source revision checks pass.
