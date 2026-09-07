ALTER TABLE operational_events ADD COLUMN IF NOT EXISTS trace_id VARCHAR(64);
ALTER TABLE operational_events ADD COLUMN IF NOT EXISTS actor_id VARCHAR(128);
ALTER TABLE operational_events ADD COLUMN IF NOT EXISTS operation VARCHAR(128);
ALTER TABLE operational_events ADD COLUMN IF NOT EXISTS result VARCHAR(32);
ALTER TABLE operational_events ADD COLUMN IF NOT EXISTS error_code VARCHAR(128);
ALTER TABLE operational_events ADD COLUMN IF NOT EXISTS clock_status VARCHAR(32);
ALTER TABLE operational_events ADD COLUMN IF NOT EXISTS previous_hash VARCHAR(64);
ALTER TABLE operational_events ADD COLUMN IF NOT EXISTS event_hash VARCHAR(64);

CREATE INDEX IF NOT EXISTS ix_operational_events_audit_chain
    ON operational_events (category, occurred_at, id, event_hash);
