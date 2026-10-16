package kr.co.a4ai.gcssaker.authpolicy

import kr.co.a4ai.gcssaker.authpolicy.domain.*
import kr.co.a4ai.gcssaker.authpolicy.infrastructure.persistence.*
import org.junit.jupiter.api.Assertions.*
import org.testcontainers.containers.PostgreSQLContainer
import java.time.Instant
import java.util.concurrent.CyclicBarrier
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

internal enum class TelemetryMixedProfile(val pageSize: Int) { SMALL_PAGE(1), MAX_PAGE(500) }
internal enum class TelemetryMixedOperation { READ, WRITE }
internal data class TelemetryMixedTiming(val operation: TelemetryMixedOperation, val milliseconds: List<Double>)

internal class TelemetryMixedLoadFixture(private val postgres: PostgreSQLContainer<*>) : AutoCloseable {
    val runtime = TelemetryWriterLoadFixture(postgres)
    val reader = JdbcTelemetryPageReader(runtime.pool)
    val actors = listOf(
        actor("dense"), actor("sparse", UserRole.OPERATOR), actor("parent", UserRole.GROUP_ADMIN),
        actor("outside"), actor("empty"),
    )

    fun initialize() {
        TelemetryOwnGroupJdbcFixture(postgres).initialize()
        runtime.jdbc.execute("CREATE EXTENSION IF NOT EXISTS pg_stat_statements")
    }

    fun reset() {
        // Only these two test-owned hot rows change; retain the real 100,001-row read distribution.
        runtime.jdbc.update("""UPDATE telemetry_latest SET altitude=0, epoch_time='0', observed_at=NULL, event_id=NULL
            WHERE uuid IN ('device-00000001', 'outside-fixture')""")
        runtime.jdbc.execute("TRUNCATE telemetry_history")
        runtime.jdbc.execute("SELECT pg_stat_statements_reset()")
    }

    fun sample(worker: Int, round: Int): TelemetryReadModel = runtime.sample(round).copy(
        uuid = if (worker == 0) "device-00000001" else "outside-fixture",
        groupId = GroupId(if (worker == 0) "dense" else "outside"),
        eventId = "mixed-event-$worker-$round",
    )

    fun concurrent(profile: TelemetryMixedProfile): List<TelemetryMixedTiming> {
        val executor = Executors.newFixedThreadPool(WORKERS)
        val wave = CyclicBarrier(WORKERS)
        try {
            val futures = (0 until WORKERS).map { worker -> executor.submit<TelemetryMixedTiming> {
                runWorker(profile, worker, wave)
            } }
            return futures.map { it.get(30, TimeUnit.SECONDS) }
        } finally {
            executor.shutdownNow()
            check(executor.awaitTermination(5, TimeUnit.SECONDS)) { "mixed_worker_cleanup_timeout" }
        }
    }

    private fun runWorker(profile: TelemetryMixedProfile, worker: Int, wave: CyclicBarrier): TelemetryMixedTiming {
        val operation = if (worker < WRITERS) TelemetryMixedOperation.WRITE else TelemetryMixedOperation.READ
        val latencies = (1..ROUNDS).map { round ->
            wave.await(5, TimeUnit.SECONDS)
            val started = System.nanoTime()
            if (operation == TelemetryMixedOperation.WRITE) runtime.writer.replaceTelemetry(sample(worker, round))
            else readAndValidate(profile, worker + round)
            (System.nanoTime() - started) / 1_000_000.0
        }
        return TelemetryMixedTiming(operation, latencies)
    }

    private fun readAndValidate(profile: TelemetryMixedProfile, index: Int) {
        val actor = actors[index % actors.size]
        val position = listOf(null, "device-00075000", "zzzz")[index % 3]
        val query = TelemetryPageQuery(TelemetryPageSize(profile.pageSize), position)
        val rows = reader.read(actor, query)
        assertTrue(rows.size <= profile.pageSize + 1)
        assertEquals(rows.map { it.uuid }.sorted().distinct(), rows.map { it.uuid })
        assertTrue(rows.all { position == null || it.uuid > position })
        val allowed = if (actor.role == UserRole.GROUP_ADMIN) setOf("dense", "sparse", "empty") + (0..31).map { "child-$it" }
            else setOf(actor.groupId.value)
        assertTrue(rows.all { it.groupId.value in allowed })
        assertTrue(rows.all { it.altitude == it.epochTime.toDouble() })
        assertTrue(rows.all { it.observedAt == null || it.observedAt == EPOCH.plusSeconds(it.epochTime.toLong()) })
    }

    fun costs(operation: TelemetryMixedOperation): Map<String, Number> {
        val prefix = if (operation == TelemetryMixedOperation.WRITE) OperationalReadSql.upsertTelemetryAndHistoryPostgres
            else OperationalReadSql.selectTelemetryBase
        return runtime.jdbc.queryForMap("""SELECT SUM(calls)::bigint AS calls, SUM(total_exec_time) AS exec_ms,
            SUM(shared_blks_hit)::bigint AS shared_hits, SUM(shared_blks_read)::bigint AS shared_reads,
            SUM(temp_blks_written)::bigint AS temp_written, SUM(wal_bytes) AS wal_bytes
            FROM pg_stat_statements WHERE query LIKE ?""", prefix.trim().substringBefore('\n') + "%")
            .mapValues { (_, value) -> value as Number }
    }

    fun emit(profile: TelemetryMixedProfile, timings: List<TelemetryMixedTiming>) {
        val rows = runtime.count("telemetry_latest")
        val history = runtime.count("telemetry_history")
        for (operation in TelemetryMixedOperation.entries) {
            val latencies = timings.filter { it.operation == operation }.flatMap { it.milliseconds }.sorted()
            val costs = costs(operation)
            assertEquals(SAMPLES.toLong(), costs.getValue("calls").toLong())
            assertEquals(0L, costs.getValue("temp_written").toLong())
            assertTrue(latencies.all { it >= 0 && it < 3_000 })
            val counters = costs.entries.joinToString(" ") { "${it.key}=${it.value}" }
            val p50 = latencies[(latencies.size - 1) / 2]
            val p95 = latencies[kotlin.math.ceil(latencies.size * 0.95).toInt() - 1]
            println("telemetry_mixed result=PASS profile=${profile.name.lowercase()} operation=${operation.name.lowercase()} " +
                "page_size=${profile.pageSize} workers=$WORKERS samples=${latencies.size} rows=$rows history_added=$history " +
                "p50_ms=$p50 p95_ms=$p95 $counters")
        }
    }

    fun first(actor: AuthenticatedPrincipal): TelemetryReadModel = reader.read(actor, TelemetryPageQuery(TelemetryPageSize(1))).first()
    fun actor(group: String, role: UserRole = UserRole.VIEWER) = AuthenticatedPrincipal("mixed-fixture", role, GroupId(group))
    override fun close() = runtime.close()

    companion object {
        const val WORKERS = 4
        const val WRITERS = 2
        const val ROUNDS = 32
        const val SAMPLES = WRITERS * ROUNDS
        const val ROWS = 100_001
        val EPOCH: Instant = Instant.parse("2026-01-01T00:00:00Z")
    }
}
