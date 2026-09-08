CREATE UNIQUE INDEX IF NOT EXISTS ux_auth_users_single_system_admin
    ON auth_users (role)
    WHERE role = 'ADMIN';
