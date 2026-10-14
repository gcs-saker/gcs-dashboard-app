-- A pre-existing fork must be investigated; never silently choose or rewrite a branch.
DO $$
BEGIN
    IF EXISTS (
        SELECT previous_hash FROM operational_events
        WHERE category IN ('security', 'audit') AND event_hash IS NOT NULL
        GROUP BY previous_hash HAVING COUNT(*) > 1
    ) THEN
        RAISE EXCEPTION 'audit_chain_preflight_failed';
    END IF;
END;
$$;

CREATE UNIQUE INDEX ux_operational_audit_previous_hash
    ON operational_events (previous_hash)
    WHERE category IN ('security', 'audit') AND event_hash IS NOT NULL;

-- The append-only contract already recognizes audit, but V23 omitted it from PostgreSQL's check.
ALTER TABLE operational_events DROP CONSTRAINT operational_events_category_check;
ALTER TABLE operational_events ADD CONSTRAINT operational_events_category_check
    CHECK (category IN ('api', 'signaling', 'network', 'stream', 'security', 'audit')) NOT VALID;
ALTER TABLE operational_events VALIDATE CONSTRAINT operational_events_category_check;
