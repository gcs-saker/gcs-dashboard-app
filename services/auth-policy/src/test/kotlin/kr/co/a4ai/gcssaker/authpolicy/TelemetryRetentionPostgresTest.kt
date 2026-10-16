package kr.co.a4ai.gcssaker.authpolicy

import org.junit.jupiter.api.*
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.assertThrows
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.EnumSource
import org.springframework.dao.DataAccessException
import org.testcontainers.containers.PostgreSQLContainer
import org.testcontainers.junit.jupiter.Container
import org.testcontainers.junit.jupiter.Testcontainers
import org.testcontainers.utility.DockerImageName
import java.sql.SQLException
import java.util.concurrent.CyclicBarrier
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

internal enum class InvalidRetentionInput {
    NULL_DAYS, ZERO_DAYS, OVER_DAYS, NULL_SIZE, ZERO_SIZE, OVER_SIZE, NULL_ANCHOR, FUTURE_ANCHOR, POS_INFINITY, NEG_INFINITY;
    fun apply(input: RetentionBatchInput) = when (this) {
        NULL_DAYS -> input.copy(days = null)
        ZERO_DAYS -> input.copy(days = 0)
        OVER_DAYS -> input.copy(days = 3651)
        NULL_SIZE -> input.copy(size = null)
        ZERO_SIZE -> input.copy(size = 0)
        OVER_SIZE -> input.copy(size = 1001)
        NULL_ANCHOR -> input.copy(anchor = null)
        FUTURE_ANCHOR -> input.copy(anchor = "2999-01-01T00:00:00Z")
        POS_INFINITY -> input.copy(anchor = "infinity")
        NEG_INFINITY -> input.copy(anchor = "-infinity")
    }
}

@Testcontainers(disabledWithoutDocker = true)
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
internal class TelemetryRetentionPostgresTest {
    private lateinit var fixture: TelemetryRetentionFixture

    @BeforeAll fun initialize() { fixture = TelemetryRetentionFixture(postgres); fixture.initialize() }
    @BeforeEach fun reset() = fixture.reset()
    @AfterAll fun close() { if (::fixture.isInitialized) fixture.close() }

    @Test
    fun `maximum batch caps both histories preserves latest and exposes residual work`() {
        fixture.seed(2001)
        assertEquals(RetentionBatchResult(1000, 1000, true), fixture.prune())
        assertEquals(RetentionBatchResult(1000, 1000, true), fixture.prune())
        assertEquals(RetentionBatchResult(1, 1, false), fixture.prune())
        assertEquals(RetentionBatchResult(0, 0, false), fixture.prune())
        assertEquals(1L to 0L, fixture.counts())
        fixture.assertLatest()
    }

    @ParameterizedTest @EnumSource(InvalidRetentionInput::class)
    fun `invalid inputs fail without changing either history`(invalid: InvalidRetentionInput) {
        fixture.seed(1)
        assertState("22023") { fixture.prune(invalid.apply(fixture.input())) }
        assertEquals(2L to 1L, fixture.counts())
    }

    @Test
    fun `valid min max days sizes and UTC cutoff equality preserve current and exact boundary`() {
        for (days in listOf(1, 3650)) for (size in listOf(1, 1000)) {
            assertEquals(RetentionBatchResult(0, 0, false), fixture.prune(fixture.input(size).copy(days = days)))
        }
        val cutoff = fixture.anchor.minusSeconds(30 * TelemetryRetentionFixture.DAY_SECONDS)
        fixture.seed(1, cutoff)
        fixture.jdbc.update("UPDATE telemetry_history SET recorded_at=CAST(? AS TIMESTAMPTZ) WHERE event_id='live-fixture'", cutoff.minusMillis(1).toString())
        fixture.transactions.executeWithoutResult {
            fixture.jdbc.execute("SET LOCAL TIME ZONE 'America/New_York'")
            assertEquals(RetentionBatchResult(1, 0, false), fixture.prune())
            assertEquals("America/New_York", fixture.jdbc.queryForObject("SHOW TIME ZONE", String::class.java))
        }
        assertEquals(1L to 1L, fixture.counts())
        fixture.assertLatest()
    }

    @Test
    fun `locked expired rows are skipped but not falsely reported complete and live ingest continues`() {
        fixture.seed(1)
        fixture.runtime.pool.connection.use { lock ->
            lock.autoCommit = false
            try {
                lock.createStatement().use { statement ->
                    statement.queryTimeout = 3
                    statement.execute("SELECT 1 FROM telemetry_history WHERE event_id='expired-1' FOR UPDATE")
                    statement.execute("SELECT 1 FROM gcs_geo.stream_telemetry_points FOR UPDATE")
                }
                assertEquals(RetentionBatchResult(0, 0, true), fixture.prune())
                fixture.runtime.writer.replaceTelemetry(fixture.runtime.sample(1).copy(observedAt = fixture.anchor, eventId = "live-next"))
                assertEquals(3L to 1L, fixture.counts())
            } finally { lock.rollback() }
        }
        assertEquals(RetentionBatchResult(1, 1, false), fixture.prune())
        assertEquals(2L to 0L, fixture.counts())
    }

    @Test
    fun `second table lock timeout rolls back first delete and recovers after release`() {
        fixture.seed(1)
        fixture.runtime.pool.connection.use { lock ->
            lock.autoCommit = false
            try {
                lock.createStatement().use { it.queryTimeout = 3; it.execute("LOCK gcs_geo.stream_telemetry_points IN ACCESS EXCLUSIVE MODE") }
                val started = System.nanoTime()
                assertState("55P03") { fixture.prune() }
                assertTrue(TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - started) < 3000)
            } finally { lock.rollback() }
        }
        assertEquals(2L to 1L, fixture.counts())
        assertEquals(RetentionBatchResult(1, 1, false), fixture.prune())
    }

    @Test
    fun `outer statement deadline cancels slow second delete and rolls back both histories`() {
        fixture.seed(1)
        fixture.jdbc.execute("""CREATE OR REPLACE FUNCTION public.retention_fixture_delay() RETURNS trigger LANGUAGE plpgsql AS
            ${'$'}${'$'} BEGIN PERFORM pg_sleep(1); RETURN OLD; END; ${'$'}${'$'}""")
        fixture.jdbc.execute("""CREATE TRIGGER reject_retention_fixture BEFORE DELETE ON gcs_geo.stream_telemetry_points
            FOR EACH ROW EXECUTE FUNCTION public.retention_fixture_delay()""")
        assertState("57014") { fixture.transactions.executeWithoutResult {
            fixture.jdbc.execute("SET LOCAL statement_timeout='100ms'")
            fixture.jdbc.execute("SET LOCAL lock_timeout='50ms'")
            fixture.query(fixture.input())
        } }
        assertEquals(2L to 1L, fixture.counts())
    }

    @Test
    fun `outer rollback and absent optional geo history keep history command atomic`() {
        fixture.seed(2)
        fixture.transactions.executeWithoutResult { status ->
            fixture.jdbc.execute("SET LOCAL statement_timeout='2s'")
            fixture.jdbc.execute("SET LOCAL lock_timeout='500ms'")
            assertEquals(RetentionBatchResult(2, 2, false), fixture.query(fixture.input()))
            status.setRollbackOnly()
        }
        assertEquals(3L to 2L, fixture.counts())
        fixture.jdbc.execute("ALTER TABLE gcs_geo.stream_telemetry_points RENAME TO retention_fixture_points")
        try { assertEquals(RetentionBatchResult(2, 0, false), fixture.prune()) }
        finally { fixture.jdbc.execute("ALTER TABLE gcs_geo.retention_fixture_points RENAME TO stream_telemetry_points") }
        fixture.assertLatest()
    }

    @Test
    fun `parallel batch workers delete disjoint rows with bounded counts`() {
        fixture.seed(500)
        val workers = Executors.newFixedThreadPool(2)
        val start = CyclicBarrier(2)
        try {
            val futures = (1..2).map { workers.submit<RetentionBatchResult> { start.await(5, TimeUnit.SECONDS); fixture.prune(fixture.input(100)) } }
            val results = futures.map { it.get(10, TimeUnit.SECONDS) }
            assertTrue(results.all { it.history == 100L && it.points == 100L && it.more })
            assertEquals(301L to 300L, fixture.counts())
        } finally { workers.shutdownNow(); assertTrue(workers.awaitTermination(5, TimeUnit.SECONDS)) }
    }

    @Test
    fun `unbounded deadlines and public role are denied before deletion`() {
        fixture.seed(1)
        for (settings in listOf("SET LOCAL statement_timeout='0'", "SET LOCAL lock_timeout='0'", "SET LOCAL statement_timeout='3s'", "SET LOCAL lock_timeout='501ms'")) {
            assertState("22023") { fixture.transactions.executeWithoutResult {
                fixture.jdbc.execute("SET LOCAL statement_timeout='2s'")
                fixture.jdbc.execute("SET LOCAL lock_timeout='500ms'")
                fixture.jdbc.execute(settings)
                fixture.query(fixture.input())
            } }
        }
        fixture.jdbc.execute("CREATE ROLE retention_fixture_reader")
        assertState("42501") { fixture.transactions.executeWithoutResult {
            fixture.jdbc.execute("SET LOCAL ROLE retention_fixture_reader")
            fixture.query(fixture.input())
        } }
        assertEquals(2L to 1L, fixture.counts())
    }

    @Test
    fun `hundred thousand expired rows retain per transaction bound and aggregate cost evidence`() {
        val rows = 100000
        val samples = 9
        fixture.seed(rows)
        fixture.jdbc.execute("ANALYZE telemetry_history")
        fixture.jdbc.execute("ANALYZE gcs_geo.stream_telemetry_points")
        fixture.jdbc.execute("SELECT pg_stat_statements_reset()")
        val latencies = (1..samples).map {
            val started = System.nanoTime()
            assertEquals(RetentionBatchResult(1000, 1000, true), fixture.prune())
            (System.nanoTime() - started) / 1_000_000.0
        }.sorted()
        assertEquals(91001L to 91000L, fixture.counts())
        fixture.assertLatest()
        val costs = fixture.jdbc.queryForMap("""SELECT SUM(calls)::bigint AS calls, SUM(total_exec_time) AS exec_ms,
            SUM(shared_blks_hit)::bigint AS shared_hits, SUM(shared_blks_read)::bigint AS shared_reads,
            SUM(temp_blks_written)::bigint AS temp_written, SUM(wal_bytes) AS wal_bytes
            FROM pg_stat_statements WHERE query LIKE 'SELECT * FROM public.prune_telemetry_history_batch(%'""")
        assertEquals(samples.toLong(), (costs.getValue("calls") as Number).toLong())
        assertTrue(latencies.all { it >= 0 && it < 3000 })
        val historyPlan = fixture.candidatePlan(RetentionHistoryTable.HISTORY)
        val pointsPlan = fixture.candidatePlan(RetentionHistoryTable.POINTS)
        assertTrue(fixture.planNodes(historyPlan).any { it.path("Index Name").asText() == "ix_telemetry_history_recorded_at" })
        val planCosts = "history_index_used=1 history_temp_written=${historyPlan.path("Temp Written Blocks").asInt()} " +
            "points_sort_nodes=${fixture.planNodes(pointsPlan).count { it.path("Node Type").asText() == "Sort" }} points_temp_written=${pointsPlan.path("Temp Written Blocks").asInt()}"
        val metrics = costs.entries.joinToString(" ") { "${it.key}=${it.value}" }
        println("telemetry_retention result=PASS rows=$rows samples=$samples batch_size=1000 history_deleted=9000 points_deleted=9000 " +
            "history_remaining=91001 points_remaining=91000 p50_ms=${latencies[4]} p95_ms=${latencies[8]} $metrics $planCosts")
    }

    private fun assertState(expected: String, command: () -> Unit) {
        val error = assertThrows<DataAccessException>(command)
        val states = generateSequence<Throwable>(error) { it.cause }.take(8).filterIsInstance<SQLException>().map { it.sqlState }.toList()
        assertTrue(expected in states, "expected SQL state not observed")
    }

    companion object {
        @Container @JvmStatic
        private val postgres = PostgreSQLContainer<Nothing>(DockerImageName.parse(
            "postgis/postgis@sha256:44126d872ac91993766c341e369c539e8196614321765d36a6f1bab0419a5fa5",
        ).asCompatibleSubstituteFor("postgres")).apply {
            setCommand("postgres", "-c", "shared_preload_libraries=pg_stat_statements", "-c", "pg_stat_statements.track=top")
        }
    }
}
