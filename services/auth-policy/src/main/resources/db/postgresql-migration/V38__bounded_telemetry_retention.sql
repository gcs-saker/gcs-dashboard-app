-- Additive, owner-only primitive. The legacy scheduled caller is not switched here (#920).
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '10s';

CREATE FUNCTION public.prune_telemetry_history_batch(
    retention_days INTEGER,
    batch_size INTEGER,
    as_of_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
)
RETURNS TABLE(history_deleted BIGINT, points_deleted BIGINT, has_more BOOLEAN)
LANGUAGE plpgsql
SET search_path = pg_catalog, public
SET timezone = 'UTC'
AS $$
DECLARE
    max_retention_days CONSTANT INTEGER := 3650;
    max_batch_size CONSTANT INTEGER := 1000;
    max_lock_timeout CONSTANT INTERVAL := INTERVAL '500 milliseconds';
    max_statement_timeout CONSTANT INTERVAL := INTERVAL '2 seconds';
    cutoff_at TIMESTAMPTZ;
    history_count BIGINT := 0;
    points_count BIGINT := 0;
    history_remaining BOOLEAN;
    points_remaining BOOLEAN := FALSE;
BEGIN
    IF retention_days IS NULL OR retention_days < 1 OR retention_days > max_retention_days
       OR batch_size IS NULL OR batch_size < 1 OR batch_size > max_batch_size
       OR as_of_at IS NULL OR NOT isfinite(as_of_at) OR as_of_at > CURRENT_TIMESTAMP THEN
        RAISE EXCEPTION 'invalid retention batch input' USING ERRCODE = '22023';
    END IF;
    -- A timeout set inside the function is not an outer-statement deadline. Require the caller's deadline.
    IF current_setting('statement_timeout')::interval NOT BETWEEN INTERVAL '1 millisecond' AND max_statement_timeout
       OR current_setting('lock_timeout')::interval NOT BETWEEN INTERVAL '1 millisecond' AND max_lock_timeout THEN
        RAISE EXCEPTION 'bounded retention timeouts required' USING ERRCODE = '22023';
    END IF;
    cutoff_at := as_of_at - make_interval(days => retention_days);
    WITH candidates AS (
        SELECT h.ctid, h.tableoid FROM public.telemetry_history h
        WHERE h.recorded_at < cutoff_at ORDER BY h.recorded_at
        LIMIT batch_size FOR UPDATE SKIP LOCKED
    )
    DELETE FROM public.telemetry_history h USING candidates c
    WHERE h.ctid = c.ctid AND h.tableoid = c.tableoid;
    GET DIAGNOSTICS history_count = ROW_COUNT;
    SELECT EXISTS (SELECT 1 FROM public.telemetry_history WHERE recorded_at < cutoff_at) INTO history_remaining;
    IF to_regclass('gcs_geo.stream_telemetry_points') IS NOT NULL THEN
        EXECUTE 'WITH candidates AS (
            SELECT p.ctid, p.tableoid FROM gcs_geo.stream_telemetry_points p
            WHERE observed_at < $1 ORDER BY observed_at LIMIT $2 FOR UPDATE SKIP LOCKED
        ) DELETE FROM gcs_geo.stream_telemetry_points p USING candidates c
          WHERE p.ctid = c.ctid AND p.tableoid = c.tableoid'
        USING cutoff_at, batch_size;
        GET DIAGNOSTICS points_count = ROW_COUNT;
        EXECUTE 'SELECT EXISTS (SELECT 1 FROM gcs_geo.stream_telemetry_points WHERE observed_at < $1)'
        INTO points_remaining USING cutoff_at;
    END IF;
    RETURN QUERY SELECT history_count, points_count, history_remaining OR points_remaining;
END;
$$;

REVOKE ALL ON FUNCTION public.prune_telemetry_history_batch(INTEGER, INTEGER, TIMESTAMPTZ) FROM PUBLIC;
