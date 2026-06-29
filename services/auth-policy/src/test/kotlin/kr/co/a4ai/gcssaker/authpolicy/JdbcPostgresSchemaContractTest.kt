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

    private companion object {
        val coreSchemaMigration: Path = Path.of("src/main/resources/db/migration/V1__auth_policy_core_schema.sql")
        val postgresInvalidDoubleType = Regex("\\bDOUBLE\\s+NOT\\s+NULL\\b", RegexOption.IGNORE_CASE)
    }
}
