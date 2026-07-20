CREATE TABLE IF NOT EXISTS device_provisioning_tokens (
    token_id VARCHAR(128) NOT NULL PRIMARY KEY,
    token_hash VARCHAR(255) NOT NULL,
    group_id VARCHAR(64) NOT NULL,
    label VARCHAR(128) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'active',
    max_uses INT NOT NULL DEFAULT 1,
    used_count INT NOT NULL DEFAULT 0,
    expires_at TIMESTAMP(3) NOT NULL,
    created_by VARCHAR(128) NOT NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_device_provisioning_tokens_group
        FOREIGN KEY (group_id) REFERENCES organization_groups (id),
    CONSTRAINT ck_device_provisioning_tokens_max_uses
        CHECK (max_uses > 0),
    CONSTRAINT ck_device_provisioning_tokens_used_count
        CHECK (used_count >= 0 AND used_count <= max_uses)
);

CREATE INDEX IF NOT EXISTS ix_device_provisioning_tokens_status_expires
    ON device_provisioning_tokens (status, expires_at);

CREATE INDEX IF NOT EXISTS ix_device_provisioning_tokens_group_created
    ON device_provisioning_tokens (group_id, created_at);
