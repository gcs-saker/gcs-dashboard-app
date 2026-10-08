# MediaMTX management and auth callback protection — 2026-10-08

- Issue: `#852`
- Production deployment: `NOT_RUN`

The MediaMTX management API remains unpublished and now requires a named internal user and secret.
Backend and Media Control attach Basic authentication with bounded HTTP timeouts. Missing credentials
receive `401`; management ports 9997/9998 remain private.

The MediaMTX auth callback remains on the isolated Docker media network and is not exposed through the
public edge. Its media token continues to be validated by Media Control without logging the token or
query secret. Server-01 runtime validation remains `NOT_RUN`.

Disposable MediaMTX 1.21.0 validation confirmed that an unauthenticated management request is denied
and the configured internal Basic identity receives `200`. The callback independently verified the
submitted API username/password before returning authorization.
