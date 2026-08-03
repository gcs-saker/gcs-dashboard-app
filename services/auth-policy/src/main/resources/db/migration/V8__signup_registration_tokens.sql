CREATE TABLE IF NOT EXISTS signup_registration_tokens (
    token_id VARCHAR(64) PRIMARY KEY,
    token_hash VARCHAR(255) NOT NULL,
    company_id INTEGER NOT NULL,
    group_id VARCHAR(128) NOT NULL,
    label VARCHAR(255) NOT NULL,
    max_uses INTEGER NOT NULL CHECK (max_uses > 0),
    used_count INTEGER NOT NULL DEFAULT 0 CHECK (used_count >= 0 AND used_count <= max_uses),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_by VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_signup_registration_tokens_active
    ON signup_registration_tokens (expires_at, used_count);
