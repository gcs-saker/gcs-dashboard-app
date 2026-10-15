package kr.co.a4ai.gcssaker.authpolicy

import kr.co.a4ai.gcssaker.authpolicy.domain.*
import kr.co.a4ai.gcssaker.authpolicy.infrastructure.persistence.*
import org.flywaydb.core.Flyway
import org.flywaydb.core.api.FlywayException
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.datasource.DriverManagerDataSource
import org.testcontainers.containers.PostgreSQLContainer
import org.testcontainers.junit.jupiter.Container
import org.testcontainers.junit.jupiter.Testcontainers
import java.sql.SQLException
import java.time.Instant

@Testcontainers(disabledWithoutDocker = true)
class DatabaseIntegrityPostgresTest {
    @BeforeEach
    fun initialize() {
        val source = dataSource()
        AuthPolicyDatabaseInitializer(source).initializeSchema()
        JdbcOrganizationHierarchyRepository(source, listOf(
            OrganizationUnit(GroupId("co-a"), "A", GroupType.COMPANY),
            OrganizationUnit(GroupId("co-b"), "B", GroupType.COMPANY),
            OrganizationUnit(GroupId("co-extra"), "Extra", GroupType.COMPANY),
        ))
    }

    @Test
    fun `long username membership follows role and primary group atomically`() {
        val source = dataSource()
        val users = JdbcAuthUserRepository(source)
        val username = "u".repeat(80)
        val saved = users.save(AuthUser(
            0, username, "long@example.test", "test-hash", 1, UserRole.OPERATOR, GroupId("co-a"),
        ))
        users.update(saved.copy(groupId = GroupId("co-b"), role = UserRole.VIEWER))
        val jdbc = JdbcTemplate(source)
        assertEquals(1, jdbc.queryForObject(
            "SELECT COUNT(*) FROM user_groups WHERE username = ? AND group_id = 'co-b' AND role_code = 'VIEWER'",
            Int::class.java, username,
        ))
        assertEquals(0, jdbc.queryForObject(
            "SELECT COUNT(*) FROM user_groups WHERE username = ? AND group_id = 'co-a'", Int::class.java, username,
        ))
        jdbc.update("INSERT INTO user_groups (username, group_id, role_code) VALUES (?, 'co-extra', 'VIEWER')", username)
        assertEquals(GroupId("co-b"), users.findByUsername(username)?.groupId)
        rejectConstraint("DELETE FROM user_groups WHERE username = ? AND group_id = 'co-b'", username)
        rejectConstraint("INSERT INTO user_groups (username, group_id, role_code) VALUES (?, 'co-a', 'VIEWER')", "orphan-user")
    }

    @Test
    fun `device primary membership follows a move without losing identity or credential`() {
        val source = dataSource()
        val devices = JdbcRegisteredDeviceRepository(source)
        val device = RegisteredDevice("membership-device", GroupId("co-a"), "Test", "test-credential-hash", deviceType = DeviceType.ROBOT)
        devices.save(device)
        devices.save(device.copy(groupId = GroupId("co-b")))
        val jdbc = JdbcTemplate(source)
        assertEquals(1, jdbc.queryForObject(
            "SELECT COUNT(*) FROM device_groups WHERE device_uuid = ? AND group_id = 'co-b'", Int::class.java, device.deviceUuid,
        ))
        assertEquals(0, jdbc.queryForObject(
            "SELECT COUNT(*) FROM device_groups WHERE device_uuid = ? AND group_id = 'co-a'", Int::class.java, device.deviceUuid,
        ))
        assertEquals(device.credentialHash, devices.findByDeviceUuid(device.deviceUuid)?.credentialHash)
        rejectConstraint("DELETE FROM device_groups WHERE device_uuid = ? AND group_id = 'co-b'", device.deviceUuid)
    }

    @Test
    fun `legacy telemetry receives an opaque stored identity without a client change`() {
        val repository = JdbcOperationalReadRepository(dataSource(), emptyList(), emptyMap())
        val sample = TelemetryReadModel(
            "legacy-identity", 35.0, 128.0, 0.0, 0.0, 0.0, 0.0, "50", 50.0, 0.0, 0.0, "0", 0.0, GroupId("co-a"),
        )
        val stored = repository.upsertTelemetry(sample)
        assertTrue(stored.eventId.orEmpty().startsWith("legacy:"))
        val principal = AuthenticatedPrincipal("fixture", UserRole.VIEWER, sample.groupId)
        assertEquals(stored.eventId, repository.telemetryFor(principal).single { it.uuid == sample.uuid }.eventId)
        assertEquals(1, repository.telemetryHistoryFor(principal, sample.uuid, 10).size)
    }

    @Test
    fun `UTC upgrade preserves instants and heap files and leaves no naive domain timestamps`() {
        val source = legacySchema("utc_fixture")
        val jdbc = JdbcTemplate(source)
        jdbc.update("INSERT INTO organization_groups (id, name, type) VALUES ('co-a', 'A', 'COMPANY')")
        jdbc.update("""INSERT INTO registered_devices (device_uuid, group_id, display_name, created_at, updated_at, last_seen_at)
            VALUES ('utc-device', 'co-a', 'Test', TIMESTAMP '2026-10-14 01:02:03.123',
                TIMESTAMP '2026-10-14 01:02:03.123', TIMESTAMP '2026-10-14 01:02:03.123')""")
        val before = jdbc.queryForObject("SELECT relfilenode FROM pg_class WHERE oid = 'registered_devices'::regclass", Long::class.java)
        AuthPolicyDatabaseInitializer(source).initializeSchema()
        assertEquals(before, jdbc.queryForObject("SELECT relfilenode FROM pg_class WHERE oid = 'registered_devices'::regclass", Long::class.java))
        assertEquals(0, jdbc.queryForObject("""SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = current_schema()
            AND data_type = 'timestamp without time zone' AND table_name <> 'flyway_schema_history'""", Int::class.java))
        source.connection.use { connection ->
            connection.createStatement().use { it.execute("SET TIME ZONE 'Asia/Seoul'") }
            connection.createStatement().use { statement ->
                statement.executeQuery("SELECT last_seen_at FROM registered_devices WHERE device_uuid = 'utc-device'").use { rows ->
                    assertTrue(rows.next())
                    assertEquals(Instant.parse("2026-10-14T01:02:03.123Z"), rows.getTimestamp(1).toInstant())
                }
            }
        }
    }

    @Test
    fun `orphan membership blocks upgrade without deleting legacy data`() {
        val source = legacySchema("orphan_fixture")
        val jdbc = JdbcTemplate(source)
        jdbc.update("INSERT INTO organization_groups (id, name, type) VALUES ('co-a', 'A', 'COMPANY')")
        jdbc.update("INSERT INTO user_groups (username, group_id, role_code) VALUES ('missing-user', 'co-a', 'VIEWER')")
        assertThrows(FlywayException::class.java) { AuthPolicyDatabaseInitializer(source).initializeSchema() }
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM user_groups", Int::class.java))
    }

    private fun rejectConstraint(sql: String, argument: String) {
        dataSource().connection.use { connection ->
            connection.autoCommit = false
            val failure = assertThrows(SQLException::class.java) {
                connection.prepareStatement(sql).use { statement -> statement.setString(1, argument); statement.executeUpdate() }
                connection.commit()
            }
            assertEquals("23503", failure.sqlState)
            connection.rollback()
        }
    }

    private fun legacySchema(name: String): DriverManagerDataSource {
        JdbcTemplate(dataSource()).execute("CREATE SCHEMA $name")
        val source = dataSource(name)
        Flyway.configure().dataSource(source).locations("classpath:db/migration", "classpath:db/postgresql-migration")
            .target("33").load().migrate()
        return source
    }

    private fun dataSource(schema: String? = null) = DriverManagerDataSource().apply {
        setDriverClassName("org.postgresql.Driver")
        url = postgres.jdbcUrl + (if (schema == null) "" else (if (postgres.jdbcUrl.contains('?')) "&" else "?") + "currentSchema=$schema")
        username = postgres.username
        password = postgres.password
    }

    companion object {
        @Container
        @JvmStatic
        private val postgres = PostgreSQLContainer<Nothing>("postgres:16-alpine")
    }
}
