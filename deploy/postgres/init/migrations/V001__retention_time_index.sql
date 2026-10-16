CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_stream_telemetry_points_observed_at_id
    ON gcs_geo.stream_telemetry_points (observed_at, id);
