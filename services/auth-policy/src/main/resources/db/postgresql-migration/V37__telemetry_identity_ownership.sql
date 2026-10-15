SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '10s';

-- Serialize first claims as well as existing UUID updates across all writers.
-- Registered-device ownership is authoritative after an approved group move.
CREATE FUNCTION enforce_telemetry_identity_ownership() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    owner_group VARCHAR;
    device_status VARCHAR;
BEGIN
    PERFORM pg_advisory_xact_lock(hashtextextended(NEW.uuid, 7401));
    SELECT group_id, status INTO owner_group, device_status
      FROM registered_devices WHERE device_uuid = NEW.uuid FOR SHARE;
    IF FOUND THEN
        IF owner_group IS DISTINCT FROM NEW.group_id OR device_status <> 'active' THEN
            RAISE EXCEPTION 'telemetry ownership conflict' USING ERRCODE = 'P7401';
        END IF;
    ELSE
        SELECT group_id INTO owner_group FROM telemetry_latest WHERE uuid = NEW.uuid;
        IF FOUND AND owner_group IS DISTINCT FROM NEW.group_id THEN
            RAISE EXCEPTION 'telemetry ownership conflict' USING ERRCODE = 'P7401';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER telemetry_latest_identity_ownership
BEFORE INSERT OR UPDATE ON telemetry_latest
FOR EACH ROW EXECUTE FUNCTION enforce_telemetry_identity_ownership();

CREATE TRIGGER telemetry_history_identity_ownership
BEFORE INSERT OR UPDATE OF uuid, group_id ON telemetry_history
FOR EACH ROW EXECUTE FUNCTION enforce_telemetry_identity_ownership();
