ALTER TABLE device_provisioning_tokens
    ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMP(3);
ALTER TABLE device_provisioning_tokens
    ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMP(3);
ALTER TABLE device_provisioning_tokens
    ADD COLUMN IF NOT EXISTS revoked_by VARCHAR(128);

ALTER TABLE signup_registration_tokens
    ADD COLUMN IF NOT EXISTS status VARCHAR(32) NOT NULL DEFAULT 'active';
ALTER TABLE signup_registration_tokens
    ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE signup_registration_tokens
    ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE signup_registration_tokens
    ADD COLUMN IF NOT EXISTS revoked_by VARCHAR(255);

UPDATE device_provisioning_tokens
SET status = 'expired', updated_at = CURRENT_TIMESTAMP
WHERE status = 'active' AND expires_at <= CURRENT_TIMESTAMP;

UPDATE signup_registration_tokens
SET status = CASE
        WHEN used_count >= max_uses THEN 'exhausted'
        WHEN expires_at <= CURRENT_TIMESTAMP THEN 'expired'
        ELSE status
    END,
    updated_at = CURRENT_TIMESTAMP
WHERE status = 'active' AND (used_count >= max_uses OR expires_at <= CURRENT_TIMESTAMP);

CREATE INDEX IF NOT EXISTS ix_signup_registration_tokens_status_expires
    ON signup_registration_tokens (status, expires_at);
