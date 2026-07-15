package kr.co.a4ai.gcssaker.authpolicy

import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.nio.file.Files
import java.nio.file.Path

class JdbcPostgresSchemaContractTest {
    @Test
    fun `flyway migration uses postgres compatible float type`() {
        val migration = Files.readString(coreSchemaMigration)

        assertFalse(postgresInvalidDoubleType.containsMatchIn(migration))
        assertTrue("DOUBLE PRECISION" in migration)
        assertTrue("CREATE TABLE IF NOT EXISTS auth_users" in migration)
        assertTrue("CREATE INDEX IF NOT EXISTS ix_operational_events_group_occurred" in migration)
    }

    @Test
    fun `schema ddl is managed by versioned flyway migration`() {
        val migration = Files.readString(coreSchemaMigration)

        assertTrue("V1__auth_policy_core_schema.sql" == coreSchemaMigration.fileName.toString())
        assertTrue("CREATE TABLE IF NOT EXISTS stream_sessions" in migration)
        assertTrue("CREATE INDEX IF NOT EXISTS ix_stream_sessions_group_status_heartbeat" in migration)
    }

    @Test
    fun `group hierarchy migration separates stream group and device identity`() {
        val migration = Files.readString(groupHierarchyMigration)

        assertTrue("CREATE TABLE IF NOT EXISTS organization_groups" in migration)
        assertTrue("CREATE TABLE IF NOT EXISTS organization_group_closure" in migration)
        assertTrue("CREATE TABLE IF NOT EXISTS registered_devices" in migration)
        assertTrue("CHECK (parent_id IS NULL OR parent_id <> id)" in migration)
        assertTrue("FOREIGN KEY (group_id) REFERENCES organization_groups (id)" in migration)
        assertFalse("stream_id VARCHAR(128) NOT NULL, group_id" in migration)
    }

    @Test
    fun `device credential migration stores only credential hash contract`() {
        val migration = Files.readString(deviceCredentialMigration)

        assertTrue("ADD COLUMN IF NOT EXISTS credential_hash" in migration)
        assertTrue("CREATE INDEX IF NOT EXISTS ix_registered_devices_uuid_status" in migration)
        assertFalse("credential VARCHAR" in migration)
    }

    @Test
    fun `device registry metadata migration separates sensors and streams`() {
        val migration = Files.readString(deviceRegistryMetadataMigration)

        assertTrue("ADD COLUMN IF NOT EXISTS device_type" in migration)
        assertTrue("CREATE TABLE IF NOT EXISTS registered_device_sensors" in migration)
        assertTrue("CREATE TABLE IF NOT EXISTS registered_device_streams" in migration)
        assertTrue("FOREIGN KEY (device_uuid) REFERENCES registered_devices (device_uuid)" in migration)
        assertTrue("CREATE INDEX IF NOT EXISTS ix_registered_device_streams_status" in migration)
    }

    private companion object {
        val coreSchemaMigration: Path = Path.of("src/main/resources/db/migration/V1__auth_policy_core_schema.sql")
        val groupHierarchyMigration: Path = Path.of("src/main/resources/db/migration/V2__group_hierarchy_and_device_identity.sql")
        val deviceCredentialMigration: Path = Path.of("src/main/resources/db/migration/V3__registered_device_credential_hash.sql")
        val deviceRegistryMetadataMigration: Path = Path.of("src/main/resources/db/migration/V5__device_registry_metadata.sql")
        val postgresInvalidDoubleType = Regex("\\bDOUBLE\\s+NOT\\s+NULL\\b", RegexOption.IGNORE_CASE)
    }
}
