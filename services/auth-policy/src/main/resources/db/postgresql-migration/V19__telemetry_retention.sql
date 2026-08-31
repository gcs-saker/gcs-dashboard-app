CREATE INDEX IF NOT EXISTS ix_telemetry_history_recorded_at
    ON telemetry_history (recorded_at);

CREATE OR REPLACE FUNCTION prune_telemetry_history(retention_days INTEGER)
RETURNS TABLE(history_deleted BIGINT, points_deleted BIGINT)
LANGUAGE plpgsql
AS $$
DECLARE
    history_count BIGINT := 0;
    points_count BIGINT := 0;
BEGIN
    IF retention_days < 1 OR retention_days > 3650 THEN
        RAISE EXCEPTION 'retention_days must be between 1 and 3650';
    END IF;

    DELETE FROM telemetry_history
    WHERE recorded_at < CURRENT_TIMESTAMP - make_interval(days => retention_days);
    GET DIAGNOSTICS history_count = ROW_COUNT;

    IF to_regclass('gcs_geo.stream_telemetry_points') IS NOT NULL THEN
        EXECUTE
            'DELETE FROM gcs_geo.stream_telemetry_points '
            'WHERE observed_at < CURRENT_TIMESTAMP - make_interval(days => $1)'
        USING retention_days;
        GET DIAGNOSTICS points_count = ROW_COUNT;
    END IF;

    RETURN QUERY SELECT history_count, points_count;
END;
$$;
