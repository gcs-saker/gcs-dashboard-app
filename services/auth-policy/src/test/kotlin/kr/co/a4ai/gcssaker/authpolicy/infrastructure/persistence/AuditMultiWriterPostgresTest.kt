package kr.co.a4ai.gcssaker.authpolicy.infrastructure.persistence

import io.micrometer.core.instrument.simple.SimpleMeterRegistry
import kr.co.a4ai.gcssaker.authpolicy.domain.GroupId
import kr.co.a4ai.gcssaker.authpolicy.domain.OperationalEventReadModel
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.datasource.DriverManagerDataSource
import org.testcontainers.containers.PostgreSQLContainer
import org.testcontainers.junit.jupiter.Container
import org.testcontainers.junit.jupiter.Testcontainers
import org.flywaydb.core.Flyway
import org.flywaydb.core.api.FlywayException
import java.time.Instant
import java.util.concurrent.Callable
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

@Testcontainers(disabledWithoutDocker = true)
class AuditMultiWriterPostgresTest {
    @Test
    fun `independent writers preserve one chain under concurrency duplicates and late timestamps`() {
        val source = dataSource()
        AuthPolicyDatabaseInitializer(source).initializeSchema()
        val registry = SimpleMeterRegistry()
        val writers = List(4) { JdbcOperationalEventWriter(source, registry) }
        val jdbc = JdbcTemplate(source)
        val before = headCount(jdbc)
        val executor = Executors.newFixedThreadPool(4)
        try {
            val work = (0 until 32).map { index -> Callable {
                val event = event("concurrent-$index", Instant.parse("2026-10-14T00:00:00Z").minusSeconds(index.toLong()))
                writers[index % writers.size].appendIfAbsent(event)
                writers[(index + 1) % writers.size].appendIfAbsent(event)
            } }
            executor.invokeAll(work, 15, TimeUnit.SECONDS).forEach { it.get() }
        } finally {
            executor.shutdownNow()
            assertTrue(executor.awaitTermination(5, TimeUnit.SECONDS))
        }
        assertEquals(before + 32, headCount(jdbc))
        assertEquals(32.0, registry.get("gcs.auth_policy.audit.append").tag("result", "duplicate").counter().count())
        verifyChain(jdbc)
    }

    @Test
    fun `locked head times out without partial append and succeeds after release`() {
        val source = dataSource()
        AuthPolicyDatabaseInitializer(source).initializeSchema()
        val registry = SimpleMeterRegistry()
        val writer = JdbcOperationalEventWriter(source, registry)
        val sample = event("lock-timeout-fixture", Instant.parse("2026-10-14T01:00:00Z"))
        source.connection.use { blocker ->
            blocker.autoCommit = false
            blocker.createStatement().use { statement ->
                statement.executeQuery("SELECT singleton FROM operational_audit_chain_head WHERE singleton = 1 FOR UPDATE").close()
            }
            val started = System.nanoTime()
            val failure = assertThrows(AuditAppendError::class.java) { writer.appendIfAbsent(sample) }
            assertEquals(AuditAppendErrorCode.LOCK_TIMEOUT, failure.errorCode)
            assertEquals(2.0, registry.get("gcs.auth_policy.audit.lock_retry").counter().count())
            assertTrue(TimeUnit.NANOSECONDS.toSeconds(System.nanoTime() - started) < 8)
            blocker.rollback()
        }
        writer.appendIfAbsent(sample)
        verifyChain(JdbcTemplate(source))
    }

    @Test
    fun `hash verifies after database timestamp and severity normalization`() {
        val source = dataSource()
        AuthPolicyDatabaseInitializer(source).initializeSchema()
        val sample = event("precision-fixture", Instant.parse("2026-10-14T02:00:00.123456789Z")).copy(
            severity = "WARN", receivedAt = Instant.parse("2026-10-14T02:00:00.789123456Z"),
            clockMeasuredAt = Instant.parse("2026-10-14T02:00:00.456789123Z"),
        )
        JdbcOperationalEventWriter(source).appendIfAbsent(sample)
        val persisted = JdbcTemplate(source).query(
            "SELECT * FROM operational_events WHERE id = ?", JdbcOperationalEventRowMappers.readModel, sample.id,
        ).single()
        assertTrue(AuditHashChain.verify(persisted))
    }

    @Test
    fun `preexisting fork blocks every startup attempt without rewriting evidence`() {
        JdbcTemplate(dataSource()).execute("CREATE SCHEMA fork_fixture")
        val forkSource = dataSource().apply {
            url = postgres.jdbcUrl + (if (postgres.jdbcUrl.contains('?')) "&" else "?") + "currentSchema=fork_fixture"
        }
        Flyway.configure().dataSource(forkSource)
            .locations("classpath:db/migration", "classpath:db/postgresql-migration")
            .target("31").load().migrate()
        val jdbc = JdbcTemplate(forkSource)
        listOf("a", "b").forEach { suffix -> jdbc.update(
            """INSERT INTO operational_events (id, occurred_at, severity, category, source, message,
                connections, latency_ms, throughput_mbps, group_id, previous_hash, event_hash)
                VALUES (?, CURRENT_TIMESTAMP, 'info', 'security', 'test', 'fork fixture', 0, 0, 0, 'co-a', ?, ?)""",
            "fork-$suffix", AuditHashChain.GENESIS_HASH, suffix.repeat(64),
        ) }
        repeat(2) {
            assertThrows(FlywayException::class.java) { AuthPolicyDatabaseInitializer(forkSource).initializeSchema() }
        }
        assertEquals(2, jdbc.queryForObject("SELECT COUNT(*) FROM operational_events", Int::class.java))
    }

    @Test
    fun `invalid insert rolls back the head and exposes a stable failure only`() {
        val source = dataSource()
        AuthPolicyDatabaseInitializer(source).initializeSchema()
        val writer = JdbcOperationalEventWriter(source)
        val jdbc = JdbcTemplate(source)
        val before = headCount(jdbc)
        val sample = event("invalid-message-fixture", Instant.parse("2026-10-14T03:00:00Z"))
        val failure = assertThrows(AuditAppendError::class.java) {
            writer.appendIfAbsent(sample.copy(message = "x".repeat(1025)))
        }
        assertEquals(AuditAppendErrorCode.STORAGE_FAILED, failure.errorCode)
        assertEquals("audit_storage_failed", failure.message)
        assertEquals(before, headCount(jdbc))
        writer.appendIfAbsent(sample)
        assertEquals(before + 1, headCount(jdbc))
        verifyChain(jdbc)
    }

    private fun verifyChain(jdbc: JdbcTemplate) {
        val links = jdbc.query(
            "SELECT previous_hash, event_hash FROM operational_events WHERE category IN ('security', 'audit') AND event_hash IS NOT NULL",
        ) { rs, _ -> rs.getString(1) to rs.getString(2) }
        val byParent = links.toMap()
        assertEquals(links.size, byParent.size)
        var cursor = AuditHashChain.GENESIS_HASH
        repeat(links.size) { cursor = byParent.getValue(cursor) }
        val head = JdbcAuditChainHeadReader(dataSource()).current()
        assertEquals(cursor, head?.eventHash)
        assertEquals(links.size.toLong(), head?.recordCount)
    }

    private fun headCount(jdbc: JdbcTemplate): Long =
        jdbc.queryForObject("SELECT event_count FROM operational_audit_chain_head WHERE singleton = 1", Long::class.java) ?: 0

    private fun event(id: String, at: Instant) = OperationalEventReadModel(
        id = id, occurredAt = at, severity = "info", category = "audit", source = "test",
        message = "multi-writer fixture", connections = 0, latencyMs = 0, throughputMbps = 0.0, groupId = GroupId("co-a"),
    )

    private fun dataSource() = DriverManagerDataSource().apply {
        setDriverClassName("org.postgresql.Driver")
        url = postgres.jdbcUrl
        username = postgres.username
        password = postgres.password
    }

    companion object {
        @Container
        @JvmStatic
        private val postgres = PostgreSQLContainer<Nothing>("postgres:16-alpine")
    }
}
