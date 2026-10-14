SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- New writes require an identity; old NULL rows are repaired by the bounded backfill command.
ALTER TABLE telemetry_history ALTER COLUMN event_id SET DEFAULT ('legacy:' || gen_random_uuid()::text);
ALTER TABLE telemetry_history ADD CONSTRAINT ck_telemetry_history_event_id_present
    CHECK (event_id IS NOT NULL) NOT VALID;
