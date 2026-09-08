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

## Functions and control flow

- A function owns one responsibility at one abstraction level. Separate orchestration, pure calculation, state mutation, and I/O.
- Production functions should stay within 40 lines and must not exceed 60 lines without a documented boundary reason.
- Functions accept at most four independent parameters. Use a named input object or split the responsibility instead of adding positional or boolean flags.
- Control-flow nesting must not exceed three levels. Prefer guard clauses and named predicates to nested `else` blocks.
- Cyclomatic complexity should remain at or below 10 and cognitive complexity at or below 15. Do not split code mechanically only to satisfy a number; split by responsibility.
- Names describe the result or side effect. Avoid standalone names such as `data`, `info`, `temp`, `util`, `helper`, `handle`, or `process` when a domain term is available.
- Query functions do not mutate external state. Command functions expose success or a typed failure and do not silently return a plausible default.
- Magic strings, numeric units, route fragments, TTLs, and retry limits use named constants or owned contract types.

## State, I/O, and failure

- Pure domain decisions do not perform database, Redis, HTTP, gRPC, filesystem, clock, UUID, or random I/O. Inject those capabilities at an application boundary.
- Do not introduce mutable global state. Every goroutine, coroutine, timer, listener, subscription, stream, and request has an explicit owner and cleanup path.
- Empty catches, ignored errors, catch-all success fallbacks, and unbounded retries are prohibited.
- Every network, database, Redis, and broker operation has an explicit timeout. Retry only idempotent work with a bounded attempt count and exponential backoff.
- Lower-level failures are translated into typed domain or boundary errors without exposing SQL, internal hosts, stack traces, credentials, or private routes.
- When state is duplicated across PostgreSQL, Redis, and browser storage, document the authoritative source, TTL, invalidation event, and degraded behavior.
- Cache keys have a single owning service, a versioned namespace where contracts may change, bounded TTLs, and no credential-bearing segments.

## Contracts and persistence

- Validate REST, gRPC, database, Redis, MQTT, and environment input at the first owned boundary.
- External DTOs, protobuf messages, persistence entities, and internal domain models remain distinct and use explicit mappers.
- Authorization decisions live in the owning policy service, not in controllers, adapters, browser components, or route construction.
- Do not duplicate role-specific APIs for the same operation. Authenticate the subject once and let policy decide the permitted result and scope.
- Contract changes test success, malformed input, unauthenticated, unauthorized, boundary values, and incompatible identity cases.
- Removed protobuf field numbers and enum values are reserved and never reused.
- Multi-record invariants use an explicit transaction. Do not make network calls while a database transaction is open.
- List APIs use bounded pagination. Avoid N+1 database, HTTP, or gRPC calls inside loops.
- Stored events and telemetry use idempotency identifiers. Internal time is UTC and field names make units explicit.

## Observability

- Operational logs use structured fields for trace ID, operation, result, duration, and a stable low-cardinality error code.
- Client IPs are accepted only from the configured trusted edge chain; record the trust source without recording credentials or raw query data.
- Metrics never use UUIDs, stream IDs, IPs, usernames, request IDs, or free-form errors as labels.
- Important pipelines expose accepted, rejected, failed, backpressure, latency, and queue-depth measurements at owned boundaries.
- Comments explain a constraint or design reason rather than narrating the code. TODOs include an issue reference and removal condition.

## Rule enforcement

- Root rules are mandatory everywhere. A nested `AGENTS.md` may make them stricter or explain language-specific application, but may not weaken security, privacy, contract, or deployment rules.
- Generated contracts, migrations, vendored sources, and build output may receive narrowly scoped size or style exemptions; generated code must never be edited by hand.
- New and changed code must meet current limits. Existing violations are baselined, may not increase, and are removed through prioritized issues.
- A lint suppression is local, names the rule, explains why the rule is inapplicable, and has a regression test when behavior or security is involved.

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
