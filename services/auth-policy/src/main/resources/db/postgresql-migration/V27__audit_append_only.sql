CREATE OR REPLACE FUNCTION reject_audit_event_mutation()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.category IN ('security', 'audit') THEN
        RAISE EXCEPTION 'audit events are append-only';
    END IF;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS operational_events_audit_append_only ON operational_events;
CREATE TRIGGER operational_events_audit_append_only
BEFORE UPDATE OR DELETE ON operational_events
FOR EACH ROW EXECUTE FUNCTION reject_audit_event_mutation();
