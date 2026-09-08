ALTER TABLE signup_registration_tokens
    ADD COLUMN IF NOT EXISTS role VARCHAR(32) NOT NULL DEFAULT 'viewer';

ALTER TABLE signup_registration_tokens
    DROP CONSTRAINT IF EXISTS ck_signup_registration_tokens_role;

ALTER TABLE signup_registration_tokens
    ADD CONSTRAINT ck_signup_registration_tokens_role CHECK (role IN ('viewer', 'operator'));
