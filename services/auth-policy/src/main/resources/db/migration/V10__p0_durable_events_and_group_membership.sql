ALTER TABLE telemetry_latest ADD COLUMN IF NOT EXISTS event_id VARCHAR(160);
ALTER TABLE telemetry_history ADD COLUMN IF NOT EXISTS event_id VARCHAR(160);

CREATE UNIQUE INDEX IF NOT EXISTS ux_telemetry_history_event_id
    ON telemetry_history (event_id);
CREATE INDEX IF NOT EXISTS ix_telemetry_latest_uuid_observed
    ON telemetry_latest (uuid, observed_at);

CREATE TABLE IF NOT EXISTS user_groups (
    username VARCHAR(50) NOT NULL,
    group_id VARCHAR(64) NOT NULL,
    role_code VARCHAR(32) NOT NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (username, group_id),
    CONSTRAINT fk_user_groups_group FOREIGN KEY (group_id) REFERENCES organization_groups (id)
);

CREATE TABLE IF NOT EXISTS device_groups (
    device_uuid VARCHAR(128) NOT NULL,
    group_id VARCHAR(64) NOT NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (device_uuid, group_id),
    CONSTRAINT fk_device_groups_device FOREIGN KEY (device_uuid) REFERENCES registered_devices (device_uuid),
    CONSTRAINT fk_device_groups_group FOREIGN KEY (group_id) REFERENCES organization_groups (id)
);

CREATE TABLE IF NOT EXISTS role_permissions (
    role_code VARCHAR(32) NOT NULL,
    permission_code VARCHAR(64) NOT NULL,
    PRIMARY KEY (role_code, permission_code)
);

INSERT INTO role_permissions (role_code, permission_code)
SELECT seed.role_code, seed.permission_code
FROM (VALUES
    ('VIEWER', 'VIEW_STREAM'),
    ('OPERATOR', 'VIEW_STREAM'),
    ('OPERATOR', 'PUBLISH_STREAM'),
    ('OPERATOR', 'CONTROL_ASSET'),
    ('ADMIN', 'VIEW_STREAM'),
    ('ADMIN', 'PUBLISH_STREAM'),
    ('ADMIN', 'CONTROL_ASSET'),
    ('ADMIN', 'MANAGE_POLICY')
) AS seed(role_code, permission_code)
WHERE NOT EXISTS (
    SELECT 1 FROM role_permissions existing
    WHERE existing.role_code = seed.role_code AND existing.permission_code = seed.permission_code
);

INSERT INTO device_groups (device_uuid, group_id)
SELECT device.device_uuid, device.group_id FROM registered_devices device
WHERE NOT EXISTS (
    SELECT 1 FROM device_groups existing
    WHERE existing.device_uuid = device.device_uuid AND existing.group_id = device.group_id
);

CREATE TABLE IF NOT EXISTS ai_result_events (
    event_id VARCHAR(160) NOT NULL PRIMARY KEY,
    stream_id VARCHAR(160) NOT NULL,
    group_id VARCHAR(64) NOT NULL,
    processor_id VARCHAR(128) NOT NULL,
    schema_version VARCHAR(64) NOT NULL,
    payload_json TEXT NOT NULL,
    generated_at TIMESTAMP(3) WITH TIME ZONE NOT NULL,
    stored_at TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_ai_result_group FOREIGN KEY (group_id) REFERENCES organization_groups (id)
);

CREATE INDEX IF NOT EXISTS ix_ai_result_stream_generated
    ON ai_result_events (stream_id, generated_at DESC);
