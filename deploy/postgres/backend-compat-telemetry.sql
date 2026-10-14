-- Explicit migration-only backend adapter storage. Online telemetry remains auth-policy-owned.
-- Apply separately with ON_ERROR_STOP; never reinterpret or rename public.telemetry_history.
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '10s';
CREATE SCHEMA IF NOT EXISTS backend_compat;
CREATE TABLE IF NOT EXISTS backend_compat.telemetry_history (
    stream_uuid VARCHAR(64) NOT NULL,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    altitude DOUBLE PRECISION,
    velocity DOUBLE PRECISION,
    "epochTime" DOUBLE PRECISION,
    received_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_backend_compat_history_stream_received
    ON backend_compat.telemetry_history (stream_uuid, received_at);
COMMIT;
