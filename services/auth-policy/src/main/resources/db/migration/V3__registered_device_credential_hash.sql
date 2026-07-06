ALTER TABLE registered_devices
    ADD COLUMN IF NOT EXISTS credential_hash VARCHAR(255);

CREATE INDEX IF NOT EXISTS ix_registered_devices_uuid_status
    ON registered_devices (device_uuid, status);
