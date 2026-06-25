CREATE EXTENSION IF NOT EXISTS postgis;

CREATE SCHEMA IF NOT EXISTS gcs_geo;

CREATE TABLE IF NOT EXISTS telemetry_realtime (
    uuid VARCHAR(64) PRIMARY KEY,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    altitude DOUBLE PRECISION,
    "magneticX" DOUBLE PRECISION,
    "magneticY" DOUBLE PRECISION,
    "magneticZ" DOUBLE PRECISION,
    soc DOUBLE PRECISION,
    "phoneBatterySOC" DOUBLE PRECISION,
    velocity DOUBLE PRECISION,
    "totalDistance" DOUBLE PRECISION,
    "epochTime" DOUBLE PRECISION,
    "portDistance" DOUBLE PRECISION
);

CREATE TABLE IF NOT EXISTS gcs_geo.stream_telemetry_points (
    id BIGSERIAL PRIMARY KEY,
    org_id TEXT NOT NULL,
    group_id TEXT NOT NULL,
    asset_id TEXT NOT NULL,
    stream_id TEXT NOT NULL,
    event_id TEXT NOT NULL,
    observed_at TIMESTAMPTZ NOT NULL,
    received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    position GEOMETRY(Point, 4326) NOT NULL,
    altitude_m DOUBLE PRECISION,
    heading_deg DOUBLE PRECISION,
    speed_mps DOUBLE PRECISION,
    battery_percent DOUBLE PRECISION,
    source_protocol TEXT NOT NULL,
    payload_format TEXT NOT NULL,
    CONSTRAINT stream_telemetry_points_event_unique UNIQUE (org_id, group_id, asset_id, event_id),
    CONSTRAINT stream_telemetry_points_position_srid CHECK (ST_SRID(position) = 4326)
);

CREATE TABLE IF NOT EXISTS gcs_geo.stream_telemetry_latest (
    org_id TEXT NOT NULL,
    group_id TEXT NOT NULL,
    asset_id TEXT NOT NULL,
    stream_id TEXT NOT NULL,
    event_id TEXT NOT NULL,
    observed_at TIMESTAMPTZ NOT NULL,
    received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    position GEOMETRY(Point, 4326) NOT NULL,
    altitude_m DOUBLE PRECISION,
    heading_deg DOUBLE PRECISION,
    speed_mps DOUBLE PRECISION,
    battery_percent DOUBLE PRECISION,
    source_protocol TEXT NOT NULL,
    payload_format TEXT NOT NULL,
    PRIMARY KEY (org_id, group_id, stream_id),
    CONSTRAINT stream_telemetry_latest_position_srid CHECK (ST_SRID(position) = 4326)
);

CREATE INDEX IF NOT EXISTS idx_stream_telemetry_points_position_gist
    ON gcs_geo.stream_telemetry_points
    USING GIST (position);

CREATE INDEX IF NOT EXISTS idx_stream_telemetry_points_group_time
    ON gcs_geo.stream_telemetry_points (org_id, group_id, observed_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_stream_telemetry_points_stream_latest
    ON gcs_geo.stream_telemetry_points (org_id, group_id, stream_id, observed_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_stream_telemetry_latest_position_gist
    ON gcs_geo.stream_telemetry_latest
    USING GIST (position);

-- Latest selected stream query. This should use the stream_telemetry_latest primary key.
-- SELECT stream_id, asset_id, observed_at, ST_X(position) AS longitude, ST_Y(position) AS latitude
-- FROM gcs_geo.stream_telemetry_latest
-- WHERE org_id = $1 AND group_id = $2 AND stream_id = $3;

-- Bounded map query. The GiST index reduces full spatial scans to candidate rows inside the viewport.
-- SELECT stream_id, asset_id, observed_at, ST_X(position) AS longitude, ST_Y(position) AS latitude
-- FROM gcs_geo.stream_telemetry_latest
-- WHERE org_id = $1
--   AND group_id = $2
--   AND position && ST_MakeEnvelope($3, $4, $5, $6, 4326)
-- ORDER BY observed_at DESC
-- LIMIT $7;
