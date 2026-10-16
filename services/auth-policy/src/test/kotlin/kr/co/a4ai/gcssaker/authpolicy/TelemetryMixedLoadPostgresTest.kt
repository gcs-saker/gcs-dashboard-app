package kr.co.a4ai.gcssaker.authpolicy

import kr.co.a4ai.gcssaker.authpolicy.domain.*
import org.junit.jupiter.api.*
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.EnumSource
import org.springframework.jdbc.datasource.DataSourceTransactionManager
import org.springframework.transaction.support.TransactionTemplate
import org.testcontainers.containers.PostgreSQLContainer
import org.testcontainers.junit.jupiter.Container
import org.testcontainers.junit.jupiter.Testcontainers
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

internal enum class TelemetryTransactionOutcome { COMMIT, ROLLBACK }

@Testcontainers(disabledWithoutDocker = true)
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
internal class TelemetryMixedLoadPostgresTest {
    private lateinit var fixture: TelemetryMixedLoadFixture

    @BeforeAll
    fun initialize() {
        fixture = TelemetryMixedLoadFixture(postgres)
        fixture.initialize()
    }

    @BeforeEach
    fun reset() = fixture.reset()

    @AfterAll
    fun close() { if (::fixture.isInitialized) fixture.close() }

    @ParameterizedTest
    @EnumSource(TelemetryMixedProfile::class)
    fun `mixed pooled readers and writers preserve scope tuple consistency and final freshness`(profile: TelemetryMixedProfile) {
        val timings = fixture.concurrent(profile)
        assertEquals(TelemetryMixedLoadFixture.ROWS, fixture.runtime.count("telemetry_latest"))
        assertEquals(TelemetryMixedLoadFixture.SAMPLES, fixture.runtime.count("telemetry_history"))
        // Capture counters before the post-load verification reads add statements.
        fixture.emit(profile, timings)
        for (worker in 0 until TelemetryMixedLoadFixture.WRITERS) {
            val expected = fixture.sample(worker, TelemetryMixedLoadFixture.ROUNDS)
            val actual = fixture.first(fixture.actor(expected.groupId.value))
            assertEquals(expected, actual)
        }
        assertTrue(fixture.reader.read(fixture.actor("empty"), TelemetryPageQuery(TelemetryPageSize(500))).isEmpty())
        assertEquals(2, fixture.runtime.jdbc.queryForObject("""SELECT COUNT(*) FROM telemetry_latest l
            JOIN (SELECT uuid, MAX(observed_at) AS newest FROM telemetry_history GROUP BY uuid) h ON h.uuid=l.uuid
            WHERE l.observed_at=h.newest AND l.event_id IS NOT NULL""", Int::class.java))
    }

    @ParameterizedTest
    @EnumSource(TelemetryTransactionOutcome::class)
    fun `reader sees committed old tuple while canonical writer is staged then commit or rollback result`(outcome: TelemetryTransactionOutcome) {
        val actor = fixture.actor("dense")
        val before = fixture.first(actor)
        val staged = fixture.sample(0, 1)
        val gates = StagedTelemetryGates()
        val executor = Executors.newSingleThreadExecutor()
        try {
            val writing = executor.submit { stageWrite(staged, outcome, gates) }
            assertTrue(gates.staged.await(5, TimeUnit.SECONDS))
            // Writer holds its uncommitted row/advisory locks until this reader finishes; no timing-only overlap claim.
            assertEquals(before, fixture.first(actor))
            assertEquals(0, fixture.runtime.count("telemetry_history"))
            gates.release.countDown()
            writing.get(5, TimeUnit.SECONDS)
            val committed = outcome == TelemetryTransactionOutcome.COMMIT
            assertEquals(if (committed) staged else before, fixture.first(actor))
            assertEquals(if (committed) 1 else 0, fixture.runtime.count("telemetry_history"))
        } finally {
            gates.release.countDown()
            executor.shutdownNow()
            assertTrue(executor.awaitTermination(5, TimeUnit.SECONDS))
        }
    }

    private fun stageWrite(sample: TelemetryReadModel, outcome: TelemetryTransactionOutcome, gates: StagedTelemetryGates) {
        val transactions = TransactionTemplate(DataSourceTransactionManager(fixture.runtime.pool)).apply { timeout = 3 }
        transactions.executeWithoutResult { status ->
            fixture.runtime.writer.replaceTelemetry(sample)
            gates.staged.countDown()
            check(gates.release.await(2, TimeUnit.SECONDS)) { "staged_writer_release_timeout" }
            if (outcome == TelemetryTransactionOutcome.ROLLBACK) status.setRollbackOnly()
        }
    }

    private class StagedTelemetryGates {
        val staged = CountDownLatch(1)
        val release = CountDownLatch(1)
    }

    companion object {
        @Container @JvmStatic
        private val postgres = PostgreSQLContainer<Nothing>("postgres:16-alpine").apply {
            setCommand("postgres", "-c", "shared_preload_libraries=pg_stat_statements", "-c", "pg_stat_statements.track=top")
        }
    }
}
