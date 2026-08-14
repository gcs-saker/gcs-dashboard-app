CREATE UNIQUE INDEX IF NOT EXISTS ux_auth_users_single_active_group_admin
    ON auth_users (group_id)
    WHERE role = 'GROUP_ADMIN' AND active = TRUE;
