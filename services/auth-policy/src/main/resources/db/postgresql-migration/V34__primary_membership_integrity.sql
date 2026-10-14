SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM auth_users u LEFT JOIN organization_groups g ON g.id = u.group_id WHERE g.id IS NULL)
       OR EXISTS (SELECT 1 FROM user_groups m LEFT JOIN auth_users u ON u.username = m.username WHERE u.username IS NULL)
       OR EXISTS (SELECT 1 FROM auth_users WHERE role NOT IN ('VIEWER', 'OPERATOR', 'GROUP_ADMIN', 'ADMIN'))
       OR EXISTS (SELECT 1 FROM user_groups WHERE role_code NOT IN ('VIEWER', 'OPERATOR', 'GROUP_ADMIN', 'ADMIN')) THEN
        RAISE EXCEPTION 'primary_membership_preflight_failed';
    END IF;
END;
$$;

ALTER TABLE user_groups ALTER COLUMN username TYPE VARCHAR(128);
INSERT INTO user_groups (username, group_id, role_code)
SELECT username, group_id, role FROM auth_users
ON CONFLICT (username, group_id) DO UPDATE SET role_code = EXCLUDED.role_code;
INSERT INTO device_groups (device_uuid, group_id)
SELECT device_uuid, group_id FROM registered_devices
ON CONFLICT (device_uuid, group_id) DO NOTHING;

CREATE UNIQUE INDEX ux_user_groups_primary_role ON user_groups (username, group_id, role_code);
CREATE INDEX ix_user_groups_group ON user_groups (group_id);
CREATE INDEX ix_device_groups_group ON device_groups (group_id);

ALTER TABLE user_groups ADD CONSTRAINT fk_user_groups_user
    FOREIGN KEY (username) REFERENCES auth_users (username) ON DELETE CASCADE
    DEFERRABLE INITIALLY DEFERRED NOT VALID;
ALTER TABLE user_groups VALIDATE CONSTRAINT fk_user_groups_user;
ALTER TABLE auth_users ADD CONSTRAINT fk_auth_users_group
    FOREIGN KEY (group_id) REFERENCES organization_groups (id) NOT VALID;
ALTER TABLE auth_users VALIDATE CONSTRAINT fk_auth_users_group;
ALTER TABLE auth_users ADD CONSTRAINT fk_auth_users_primary_membership
    FOREIGN KEY (username, group_id, role) REFERENCES user_groups (username, group_id, role_code)
    DEFERRABLE INITIALLY DEFERRED NOT VALID;
ALTER TABLE auth_users VALIDATE CONSTRAINT fk_auth_users_primary_membership;
ALTER TABLE registered_devices ADD CONSTRAINT fk_registered_devices_primary_membership
    FOREIGN KEY (device_uuid, group_id) REFERENCES device_groups (device_uuid, group_id)
    DEFERRABLE INITIALLY DEFERRED NOT VALID;
ALTER TABLE registered_devices VALIDATE CONSTRAINT fk_registered_devices_primary_membership;

CREATE FUNCTION synchronize_user_primary_membership() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'UPDATE' AND (OLD.username, OLD.group_id) IS DISTINCT FROM (NEW.username, NEW.group_id) THEN
        DELETE FROM user_groups WHERE username = OLD.username AND group_id = OLD.group_id;
    END IF;
    INSERT INTO user_groups (username, group_id, role_code) VALUES (NEW.username, NEW.group_id, NEW.role)
    ON CONFLICT (username, group_id) DO UPDATE SET role_code = EXCLUDED.role_code;
    RETURN NEW;
END;
$$;
CREATE TRIGGER auth_users_primary_membership AFTER INSERT OR UPDATE OF username, group_id, role ON auth_users
    FOR EACH ROW EXECUTE FUNCTION synchronize_user_primary_membership();

CREATE FUNCTION synchronize_device_primary_membership() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'UPDATE' AND OLD.group_id IS DISTINCT FROM NEW.group_id THEN
        DELETE FROM device_groups WHERE device_uuid = OLD.device_uuid AND group_id = OLD.group_id;
    END IF;
    INSERT INTO device_groups (device_uuid, group_id) VALUES (NEW.device_uuid, NEW.group_id)
    ON CONFLICT (device_uuid, group_id) DO NOTHING;
    RETURN NEW;
END;
$$;
CREATE TRIGGER registered_devices_primary_membership AFTER INSERT OR UPDATE OF group_id ON registered_devices
    FOR EACH ROW EXECUTE FUNCTION synchronize_device_primary_membership();

ALTER TABLE auth_users ADD CONSTRAINT ck_auth_users_role
    CHECK (role IN ('VIEWER', 'OPERATOR', 'GROUP_ADMIN', 'ADMIN')) NOT VALID;
ALTER TABLE auth_users VALIDATE CONSTRAINT ck_auth_users_role;
ALTER TABLE user_groups ADD CONSTRAINT ck_user_groups_role
    CHECK (role_code IN ('VIEWER', 'OPERATOR', 'GROUP_ADMIN', 'ADMIN')) NOT VALID;
ALTER TABLE user_groups VALIDATE CONSTRAINT ck_user_groups_role;
ALTER TABLE registered_devices ADD CONSTRAINT ck_registered_devices_status
    CHECK (status IN ('active', 'pending', 'disabled')) NOT VALID;
ALTER TABLE registered_devices VALIDATE CONSTRAINT ck_registered_devices_status;
ALTER TABLE registered_devices ADD CONSTRAINT ck_registered_devices_type
    CHECK (device_type IN ('robot', 'drone', 'camera', 'mic', 'phone', 'edge-gateway')) NOT VALID;
ALTER TABLE registered_devices VALIDATE CONSTRAINT ck_registered_devices_type;
ALTER TABLE organization_groups ADD CONSTRAINT ck_organization_groups_type
    CHECK (type IN ('BATTALION', 'COMPANY', 'PLATOON', 'SQUAD')) NOT VALID;
ALTER TABLE organization_groups VALIDATE CONSTRAINT ck_organization_groups_type;
ALTER TABLE organization_groups ADD CONSTRAINT ck_organization_groups_status
    CHECK (status IN ('active', 'inactive')) NOT VALID;
ALTER TABLE organization_groups VALIDATE CONSTRAINT ck_organization_groups_status;
