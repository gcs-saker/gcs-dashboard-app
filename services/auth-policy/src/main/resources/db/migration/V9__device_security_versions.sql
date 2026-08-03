ALTER TABLE registered_devices
    ADD COLUMN IF NOT EXISTS credential_version BIGINT NOT NULL DEFAULT 1;

ALTER TABLE registered_devices
    ADD COLUMN IF NOT EXISTS policy_version BIGINT NOT NULL DEFAULT 1;
