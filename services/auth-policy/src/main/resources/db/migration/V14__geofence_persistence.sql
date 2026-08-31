CREATE TABLE IF NOT EXISTS geofences (
    id VARCHAR(160) NOT NULL PRIMARY KEY,
    name VARCHAR(160) NOT NULL,
    group_id VARCHAR(64) NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_geofences_group FOREIGN KEY (group_id) REFERENCES organization_groups (id)
);

CREATE INDEX IF NOT EXISTS ix_geofences_group_enabled
    ON geofences (group_id, enabled);

CREATE TABLE IF NOT EXISTS geofence_points (
    geofence_id VARCHAR(160) NOT NULL,
    point_order INTEGER NOT NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    PRIMARY KEY (geofence_id, point_order),
    CONSTRAINT fk_geofence_points_geofence
        FOREIGN KEY (geofence_id) REFERENCES geofences (id) ON DELETE CASCADE
);
