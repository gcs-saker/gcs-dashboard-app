# Python backend code agreement

The repository root agreement applies in full. These rules specialize it for Python under `backend/`.

## Boundaries and types

- Compatibility routes and adapters translate external contracts; they do not own authorization policy or media routing decisions.
- All production functions and public interfaces are typed. Avoid domain use of `dict[str, Any]`; use validated boundary models and typed domain values.
- Pydantic models stay at API/configuration boundaries and do not become persistence or domain models.
- External camelCase and legacy database names use aliases in DTOs or mappers and never leak into Python identifiers.

## Errors and resources

- Do not use mutable default arguments, bare `except`, empty catches, or `except Exception` that converts failure into success.
- Domain and adapter exceptions use specific `PascalCase` names ending in `Error`; preserve the cause with explicit chaining.
- Async code does not perform blocking I/O on the event loop. Clients, responses, sessions, cursors, and temporary resources use context-managed cleanup.
- Clock, UUID, random, network, and storage dependencies are injectable where deterministic tests require control.

## Verification

- Ruff formatting and lint, strict project mypy, pytest coverage, contract generation, and boundary gates must pass.
- New parsing, authorization, persistence, or retry logic includes malformed, denied, timeout, duplicate, and cleanup tests.
- Ruff or mypy ignores are local and include a precise reason; broad file-level exclusions require an owned generated-code boundary.
