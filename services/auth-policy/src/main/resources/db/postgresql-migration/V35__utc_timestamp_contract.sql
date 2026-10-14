SET LOCAL TIME ZONE 'UTC';
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- PostgreSQL 12+ can avoid heap rewrites for this cast in a UTC session.
-- Retain stored instants and use PostgreSQL's microsecond precision for future writes.
-- An explicit TIMESTAMPTZ(3) typmod forces a heap rewrite on PostgreSQL 16.
DO $$
DECLARE column_contract RECORD;
BEGIN
    FOR column_contract IN
        SELECT table_schema, table_name, column_name, datetime_precision
        FROM information_schema.columns
        WHERE table_schema = current_schema() AND data_type = 'timestamp without time zone'
          AND table_name IN (
              'organization_groups', 'registered_devices', 'registered_device_sensors', 'registered_device_streams',
              'device_provisioning_tokens', 'signup_registration_tokens', 'user_groups', 'device_groups',
              'telemetry_latest', 'telemetry_history', 'admin_mfa_recovery_use', 'gateway_assets',
              'server_health_snapshots', 'stream_sessions', 'operational_events'
          )
    LOOP
        EXECUTE format('ALTER TABLE %I.%I ALTER COLUMN %I TYPE TIMESTAMPTZ',
            column_contract.table_schema, column_contract.table_name, column_contract.column_name);
    END LOOP;
END;
$$;
