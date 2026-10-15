package kr.co.a4ai.gcssaker.authpolicy

import kr.co.a4ai.gcssaker.authpolicy.domain.*
import kr.co.a4ai.gcssaker.authpolicy.infrastructure.persistence.*
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.datasource.DriverManagerDataSource
import org.testcontainers.containers.PostgreSQLContainer
import org.testcontainers.junit.jupiter.Container
import org.testcontainers.junit.jupiter.Testcontainers
import java.time.Instant
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

@Testcontainers(disabledWithoutDocker = true)
class TelemetryOwnershipPostgresTest {
    private fun source() = DriverManagerDataSource(postgres.jdbcUrl, postgres.username, postgres.password)
    private fun repository() = JdbcOperationalReadRepository(source(), emptyList(), emptyMap())
    private fun principal(group: String) = AuthenticatedPrincipal("fixture", UserRole.VIEWER, GroupId(group))
    private fun sample(uuid: String, group: String) = TelemetryReadModel(
        uuid, 35.0, 128.0, 0.0, 0.0, 0.0, 0.0, "50", 50.0, 0.0, 0.0, "0", 0.0, GroupId(group), observedAt = Instant.now(),
    )

    @BeforeEach
    fun initialize() {
        AuthPolicyDatabaseInitializer(source()).initializeSchema()
        JdbcOrganizationHierarchyRepository(source(), listOf(
            OrganizationUnit(GroupId("co-a"), "A", GroupType.COMPANY),
            OrganizationUnit(GroupId("co-b"), "B", GroupType.COMPANY),
        ))
    }

    @Test
    fun `cross group UUID update rolls back both history and latest`() {
        val first = repository()
        first.upsertTelemetry(sample("owned", "co-a"))
        assertEquals(TelemetryWriteErrors.OWNERSHIP_CONFLICT, assertThrows<PermissionDeniedError> {
            repository().upsertTelemetry(sample("owned", "co-b"))
        }.code)
        assertEquals(1, first.telemetryHistoryFor(principal("co-a"), "owned", 10).size)
        assertTrue(first.telemetryHistoryFor(principal("co-b"), "owned", 10).isEmpty())
    }

    @Test
    fun `concurrent first claims from independent writers have exactly one group owner`() {
        val writers = listOf(repository(), repository())
        val executor = Executors.newFixedThreadPool(2)
        val start = CountDownLatch(1)
        try {
            val futures = listOf("co-a", "co-b").mapIndexed { index, group -> executor.submit<Boolean> {
                assertTrue(start.await(5, TimeUnit.SECONDS))
                try { writers[index].upsertTelemetry(sample("racing", group)); true }
                catch (_: PermissionDeniedError) { false }
            } }
            start.countDown()
            assertEquals(1, futures.count { it.get(10, TimeUnit.SECONDS) })
            assertEquals(1, JdbcTemplate(source()).queryForObject(
                "SELECT COUNT(DISTINCT group_id) FROM telemetry_history WHERE uuid = 'racing'", Int::class.java,
            ))
        } finally {
            executor.shutdownNow()
            assertTrue(executor.awaitTermination(5, TimeUnit.SECONDS))
        }
    }

    @Test
    fun `registered group move remains authoritative and old group is rejected`() {
        val devices = JdbcRegisteredDeviceRepository(source())
        val device = RegisteredDevice("moving", GroupId("co-a"), "Test", "hash", RegisteredDeviceStatus.ACTIVE)
        devices.save(device)
        val reads = repository()
        reads.upsertTelemetry(sample(device.deviceUuid, "co-a"))
        devices.save(device.copy(groupId = GroupId("co-b")))
        reads.upsertTelemetry(sample(device.deviceUuid, "co-b"))
        assertThrows<PermissionDeniedError> { reads.upsertTelemetry(sample(device.deviceUuid, "co-a")) }
        assertEquals("moving", reads.telemetryFor(principal("co-b")).single { it.uuid == device.deviceUuid }.uuid)
    }

    @Test
    fun `event ID backfill does not reauthorize historical ownership after group move`() {
        val devices = JdbcRegisteredDeviceRepository(source())
        val device = RegisteredDevice("history-move", GroupId("co-a"), "Test", "hash", RegisteredDeviceStatus.ACTIVE)
        devices.save(device)
        repository().upsertTelemetry(sample(device.deviceUuid, "co-a"))
        devices.save(device.copy(groupId = GroupId("co-b")))
        assertEquals(1, JdbcTemplate(source()).update("UPDATE telemetry_history SET event_id = 'backfilled' WHERE uuid = ?", device.deviceUuid))
    }

    @Test
    fun `identity lock contention is bounded rolls back and recovers after release`() {
        val reads = repository()
        source().connection.use { connection ->
            connection.autoCommit = false
            connection.createStatement().use {
                it.queryTimeout = 3
                it.execute("SELECT pg_advisory_xact_lock(hashtextextended('locked', 7401))")
            }
            val started = System.nanoTime()
            assertThrows<TelemetryStorageUnavailableError> { reads.upsertTelemetry(sample("locked", "co-a")) }
            assertTrue(TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - started) < 3_000)
            connection.rollback()
        }
        assertTrue(reads.telemetryHistoryFor(principal("co-a"), "locked", 10).isEmpty())
        reads.upsertTelemetry(sample("locked", "co-a"))
        assertEquals(1, reads.telemetryHistoryFor(principal("co-a"), "locked", 10).size)
    }

    companion object {
        @Container @JvmStatic
        private val postgres = PostgreSQLContainer<Nothing>("postgres:16-alpine")
    }
}
