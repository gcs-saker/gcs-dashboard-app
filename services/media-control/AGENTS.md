# Media-control code agreement

The repository root agreement applies in full. These rules specialize it for Go under `services/media-control/`.

## Service boundary

- Media-control owns stream discovery, opaque publish/playback sessions, gRPC gateway handling, and Redis media-session state.
- HTTP and gRPC handlers decode, validate, authorize through owned ports, invoke an application operation, and encode a response. Domain decisions do not depend on transport types.
- Stream IDs remain opaque outside this service. Actual MediaMTX paths and token material never enter browser contracts or logs.

## Go lifecycle and concurrency

- `context.Context` is the first parameter of request-scoped work and is never stored in a long-lived struct.
- Wrap errors with `%w` and classify them with `errors.Is` or `errors.As`; do not branch on error text.
- Every goroutine has an owner, cancellation path, bounded lifetime, and testable shutdown behavior.
- The creating owner closes a channel. Do not close receive-only channels or rely on garbage collection to stop tickers and workers.
- Response bodies, timers, tickers, spans, and temporary resources are closed on every path.
- Shared mutable state uses one explicit synchronization strategy. Do not mix mutex, channel, and atomic ownership for the same invariant.

## Verification

- `gofmt`, `go vet`, race tests, unit/integration tests, generated protobuf verification, and image security scans must pass.
- Concurrency changes include cancellation, timeout, duplicate request, shutdown, and race coverage.
- Authorization and session changes test success plus missing, expired, mismatched, replayed, and cross-group credentials or tokens.
