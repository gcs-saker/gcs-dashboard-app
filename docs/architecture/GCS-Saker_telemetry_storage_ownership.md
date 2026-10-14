# Telemetry storage ownership

Auth Policy owns online ingestion, idempotent event history in `public.telemetry_history`, current values in `public.telemetry_latest`, and PostGIS projections. PostgreSQL is authoritative; Redis and dashboard state are derived caches. REST, internal gRPC and MQTT all reach that owner. Existing mobile requests and response shapes are unchanged.

The backend `LegacyDbTelemetryBulkSink` is a migration-only compatibility consumer. Its history DTO uses `stream_uuid/received_at`, not Auth Policy's `uuid/recorded_at/event_id/group_id` contract. Its SQL now explicitly names `backend_compat.telemetry_history`; it must never insert that DTO into `public.telemetry_history`. Legacy latest values remain in the existing separate `telemetry_realtime` table. Compatibility storage is not an alternative source for online authorization or dashboard reads.

Before enabling this migration-only adapter, apply `deploy/postgres/backend-compat-telemetry.sql` with `psql --set ON_ERROR_STOP=1` using the backend's migration identity. The script is idempotent, uses bounded lock/statement timeouts, and does not rename, copy, truncate or delete canonical data. Existing canonical history requires no backfill. If an old installation contains a different shape under the canonical name, stop and inventory that relation before migration; do not silently reinterpret it.

V31 changes `operational_stream_session_latest` to one row per `(group_id, stream_id)`, choosing the newest heartbeat and then the largest identity. Multiple sessions for a stream remain available in the history table. This corrects the earlier per-session partition without dropping session history or changing the view's column contract.

Removal condition: after the remaining migration-only consumers stop using `LegacyDbTelemetryBulkSink`, remove the compatibility sink and archive its separately owned history. Track that retirement under #917. The compatibility DDL is intentionally not part of Auth Policy's Flyway lifecycle, nor run automatically during production application startup.
