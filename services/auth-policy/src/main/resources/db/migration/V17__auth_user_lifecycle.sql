ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS security_version BIGINT NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS ix_auth_users_group_role_active
    ON auth_users (group_id, role, active);
