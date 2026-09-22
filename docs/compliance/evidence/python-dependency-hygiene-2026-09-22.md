# Python dependency hygiene — 2026-09-22

- Related issue: `#663`
- Result: `PASS`
- Production deployment: `NOT_RUN`

The development requirements include the runtime requirements with `-r requirements-runtime.txt`.
Direct `grpcio` and `protobuf` entries in the development file therefore duplicated the same pinned
runtime packages. They were removed without changing the resolved versions used by development,
tests, or the runtime image.

A repository gate now normalizes Python distribution names and rejects any package declared in both
files. The negative test covers extras and a different version operator so cosmetic requirement
syntax cannot bypass the duplicate check.

The import audit also reviewed apparent false positives. `uvicorn` is the container command,
`psycopg2-binary` is loaded by the SQLAlchemy dialect, gRPC is imported lazily, and protobuf is used by
generated contract modules. These runtime dependencies were retained; no scanner exception was added.

Focused Docker verification passed `pip check`, the declaration gate, Ruff, mypy, and two gate tests.
An additional full-suite attempt produced 751 passes, 2 skips, and 18 environment failures because the
minimal Python image lacked Git and protoc and Windows bind-mounted shell files had CRLF endings. Those
failures are `BLOCKED` local evidence rather than product failures; the required Linux backend CI job is
the authoritative full-suite result for this change.
