package kr.co.a4ai.gcssaker.authpolicy

import kr.co.a4ai.gcssaker.authpolicy.domain.*
import kr.co.a4ai.gcssaker.authpolicy.infrastructure.persistence.*
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.testcontainers.containers.PostgreSQLContainer
import org.testcontainers.junit.jupiter.Container
import org.testcontainers.junit.jupiter.Testcontainers
import java.util.concurrent.TimeUnit

@Testcontainers(disabledWithoutDocker = true)
class TelemetryWriterLoadPostgresTest {
    private lateinit var fixture: TelemetryWriterLoadFixture

    @BeforeEach
    fun initialize() {
        fixture = TelemetryWriterLoadFixture(postgres)
        fixture.initialize()
    }

    @AfterEach
    fun close() = fixture.close()

    @Test
    fun `independent identities commit one atomic latest and history statement per event`() {
        verifyProfile(TelemetryWriteProfile.DISTINCT_IDENTITIES, TelemetryWriterLoadFixture.WRITES)
    }

    @Test
    fun `same identity concurrent events retain full history and newest latest`() {
        verifyProfile(TelemetryWriteProfile.SAME_IDENTITY, 1)
        assertEquals((TelemetryWriterLoadFixture.WRITES - 1).toString(), fixture.jdbc.queryForObject(
            "SELECT epoch_time FROM telemetry_latest", String::class.java,
        ))
    }

    @Test
    fun `concurrent event replay is idempotent and does not rewrite latest`() {
        fixture.writer.replaceTelemetry(fixture.sample(0, TelemetryWriteProfile.DUPLICATE_EVENT))
        val tupleBefore = fixture.jdbc.queryForObject("SELECT ctid::text FROM telemetry_latest", String::class.java)
        fixture.jdbc.execute("SELECT pg_stat_statements_reset()")
        verifyProfile(TelemetryWriteProfile.DUPLICATE_EVENT, 1)
        assertEquals(1, fixture.count("telemetry_history"))
        assertEquals(tupleBefore, fixture.jdbc.queryForObject(
            "SELECT ctid::text FROM telemetry_latest", String::class.java,
        ))
    }

    private fun verifyProfile(profile: TelemetryWriteProfile, latest: Int) {
        val latencies = fixture.concurrentWrites(profile)
        val expectedHistory = if (profile == TelemetryWriteProfile.DUPLICATE_EVENT) 1 else TelemetryWriterLoadFixture.WRITES
        assertEquals(expectedHistory, fixture.count("telemetry_history"))
        assertEquals(latest, fixture.count("telemetry_latest"))
        val costs = fixture.statementCosts()
        assertEquals(TelemetryWriterLoadFixture.WRITES.toLong(), costs.getValue("calls").toLong())
        assertEquals(0L, costs.getValue("temp_written").toLong())
        assertTrue(costs.getValue("wal_bytes").toDouble() >= 0)
        assertTrue(latencies.all { it >= 0 && it < 3_000 })
        fixture.emit(profile, latencies)
    }

    @Test
    fun `held identity lock does not block other identities and failed event recovers atomically`() {
        val blocked = fixture.sample(0)
        fixture.pool.connection.use { lock ->
            lock.autoCommit = false
            try {
                lock.prepareStatement("SELECT pg_advisory_xact_lock(hashtextextended(?, 7401))").use {
                    it.queryTimeout = 3
                    it.setString(1, blocked.uuid)
                    it.execute()
                }
                val started = System.nanoTime()
                assertThrows<TelemetryStorageUnavailableError> { fixture.writer.replaceTelemetry(blocked) }
                assertTrue(TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - started) < 3_000)
                assertEquals(0, fixture.count("telemetry_history"))
                assertEquals(0, fixture.count("telemetry_latest"))
                fixture.writer.replaceTelemetry(fixture.sample(1, TelemetryWriteProfile.DISTINCT_IDENTITIES))
                assertEquals(1, fixture.count("telemetry_history"))
            } finally {
                lock.rollback()
            }
        }
        fixture.writer.replaceTelemetry(blocked)
        assertEquals(2, fixture.count("telemetry_history"))
        assertEquals(2, fixture.count("telemetry_latest"))
    }

    @Test
    fun `registered ownership and inactive status denial preserve both tables`() {
        val devices = JdbcRegisteredDeviceRepository(fixture.pool)
        val sample = fixture.sample(0)
        val device = RegisteredDevice(sample.uuid, sample.groupId, "Fixture", "hash", RegisteredDeviceStatus.ACTIVE)
        devices.save(device)
        assertEquals(TelemetryWriteErrors.OWNERSHIP_CONFLICT, assertThrows<PermissionDeniedError> {
            fixture.writer.replaceTelemetry(sample.copy(groupId = GroupId("co-b")))
        }.code)
        devices.save(device.copy(status = RegisteredDeviceStatus.DISABLED))
        assertThrows<PermissionDeniedError> { fixture.writer.replaceTelemetry(sample) }
        assertEquals(0, fixture.count("telemetry_history"))
        assertEquals(0, fixture.count("telemetry_latest"))
        devices.save(device)
        fixture.writer.replaceTelemetry(sample)
        assertEquals(1, fixture.count("telemetry_history"))
        assertEquals(1, fixture.count("telemetry_latest"))
    }

    companion object {
        @Container @JvmStatic
        private val postgres = PostgreSQLContainer<Nothing>("postgres:16-alpine").apply {
            setCommand("postgres", "-c", "shared_preload_libraries=pg_stat_statements", "-c", "pg_stat_statements.track=top")
        }
    }
}
