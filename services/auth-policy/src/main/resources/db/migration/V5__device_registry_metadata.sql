ALTER TABLE registered_devices
    ADD COLUMN IF NOT EXISTS device_type VARCHAR(32) NOT NULL DEFAULT 'drone';

CREATE TABLE IF NOT EXISTS registered_device_sensors (
    device_uuid VARCHAR(128) NOT NULL,
    sensor_id VARCHAR(128) NOT NULL,
    sensor_type VARCHAR(64) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'active',
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (device_uuid, sensor_id),
    CONSTRAINT fk_registered_device_sensors_device
        FOREIGN KEY (device_uuid) REFERENCES registered_devices (device_uuid)
);

CREATE INDEX IF NOT EXISTS ix_registered_device_sensors_type_status
    ON registered_device_sensors (sensor_type, status);

CREATE TABLE IF NOT EXISTS registered_device_streams (
    device_uuid VARCHAR(128) NOT NULL,
    stream_path VARCHAR(256) NOT NULL,
    kind VARCHAR(32) NOT NULL DEFAULT 'webrtc',
    status VARCHAR(32) NOT NULL DEFAULT 'active',
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (device_uuid, stream_path),
    CONSTRAINT fk_registered_device_streams_device
        FOREIGN KEY (device_uuid) REFERENCES registered_devices (device_uuid)
);

CREATE INDEX IF NOT EXISTS ix_registered_device_streams_status
    ON registered_device_streams (status, stream_path);
