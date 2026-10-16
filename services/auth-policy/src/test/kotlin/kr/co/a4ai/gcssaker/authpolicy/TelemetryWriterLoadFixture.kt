package kr.co.a4ai.gcssaker.authpolicy

import com.zaxxer.hikari.HikariConfig
import com.zaxxer.hikari.HikariDataSource
import kr.co.a4ai.gcssaker.authpolicy.domain.*
import kr.co.a4ai.gcssaker.authpolicy.infrastructure.persistence.*
import org.springframework.jdbc.core.JdbcTemplate
import org.testcontainers.containers.PostgreSQLContainer
import java.time.Instant
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

internal enum class TelemetryWriteProfile { DISTINCT_IDENTITIES, SAME_IDENTITY, DUPLICATE_EVENT }

internal class TelemetryWriterLoadFixture(postgres: PostgreSQLContainer<*>) : AutoCloseable {
    val pool = HikariDataSource(HikariConfig().apply {
        jdbcUrl = postgres.jdbcUrl
        username = postgres.username
        password = postgres.password
        maximumPoolSize = WORKERS + 2
        minimumIdle = 0
        connectionTimeout = 1_000
        validationTimeout = 500
        addDataSourceProperty("connectTimeout", "3")
        addDataSourceProperty("socketTimeout", "5")
    })
    val jdbc = JdbcTemplate(pool).apply { queryTimeout = 3 }
    val writer = OperationalReadJdbcWriter(pool)

    fun initialize() {
        AuthPolicyDatabaseInitializer(pool).initializeSchema()
        JdbcOrganizationHierarchyRepository(pool, listOf("co-a", "co-b").map {
            OrganizationUnit(GroupId(it), it, GroupType.COMPANY)
        })
        jdbc.execute("CREATE EXTENSION IF NOT EXISTS pg_stat_statements")
        // Disposable, class-owned database only; do not reset statistics on a shared runtime.
        jdbc.execute("TRUNCATE telemetry_latest, telemetry_history")
        jdbc.execute("SELECT pg_stat_statements_reset()")
    }

    fun sample(index: Int, profile: TelemetryWriteProfile = TelemetryWriteProfile.SAME_IDENTITY): TelemetryReadModel {
        val event = if (profile == TelemetryWriteProfile.DUPLICATE_EVENT) 0 else index
        val identity = if (profile == TelemetryWriteProfile.DISTINCT_IDENTITIES) index else 0
        return TelemetryReadModel(
            "fixture-device-$identity", 35.0, 128.0, index.toDouble(), 0.0, 0.0, 0.0,
            "50", 50.0, 0.0, 0.0, event.toString(), 0.0, GroupId("co-a"),
            observedAt = Instant.parse("2026-01-01T00:00:00Z").plusSeconds(event.toLong()),
            eventId = "fixture-event-$event",
        )
    }

    fun concurrentWrites(profile: TelemetryWriteProfile): List<Double> {
        val executor = Executors.newFixedThreadPool(WORKERS)
        val start = CountDownLatch(1)
        try {
            val results = (0 until WRITES).map { index -> executor.submit<Double> {
                check(start.await(5, TimeUnit.SECONDS)) { "writer_start_timeout" }
                val started = System.nanoTime()
                writer.replaceTelemetry(sample(index, profile))
                (System.nanoTime() - started) / 1_000_000.0
            } }
            start.countDown()
            return results.map { it.get(15, TimeUnit.SECONDS) }.sorted()
        } finally {
            executor.shutdownNow()
            check(executor.awaitTermination(5, TimeUnit.SECONDS)) { "writer_cleanup_timeout" }
        }
    }

    fun count(table: String): Int {
        require(table in setOf("telemetry_latest", "telemetry_history"))
        return requireNotNull(jdbc.queryForObject("SELECT COUNT(*) FROM $table", Int::class.java))
    }

    fun statementCosts(): Map<String, Number> = jdbc.queryForMap("""
        SELECT SUM(calls)::bigint AS calls, SUM(total_exec_time) AS exec_ms,
               SUM(shared_blks_hit)::bigint AS shared_hits, SUM(shared_blks_read)::bigint AS shared_reads,
               SUM(temp_blks_written)::bigint AS temp_written, SUM(wal_bytes) AS wal_bytes
        FROM pg_stat_statements WHERE query LIKE ?
    """, OperationalReadSql.upsertTelemetryAndHistoryPostgres.trim().substringBefore('\n') + "%")
        .mapValues { (_, value) -> value as Number }

    fun emit(profile: TelemetryWriteProfile, latencies: List<Double>) {
        val costs = statementCosts().entries.joinToString(" ") { "${it.key}=${it.value}" }
        val p50 = latencies[(latencies.size - 1) / 2]
        val p95 = latencies[kotlin.math.ceil(latencies.size * 0.95).toInt() - 1]
        println("telemetry_writer result=PASS case=${profile.name.lowercase()} workers=$WORKERS samples=${latencies.size} " +
            "history=${count("telemetry_history")} latest=${count("telemetry_latest")} p50_ms=$p50 p95_ms=$p95 $costs")
    }

    override fun close() = pool.close()

    companion object {
        const val WORKERS = 4
        const val WRITES = 64
    }
}
