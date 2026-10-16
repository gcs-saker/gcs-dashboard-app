package kr.co.a4ai.gcssaker.authpolicy

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.datasource.DriverManagerDataSource
import org.testcontainers.containers.PostgreSQLContainer
import org.testcontainers.junit.jupiter.Container
import org.testcontainers.junit.jupiter.Testcontainers
import org.testcontainers.utility.DockerImageName
import java.time.Instant

internal data class GeoInsertCost(val latencyMs: Double, val walBytes: Double)

@Testcontainers(disabledWithoutDocker = true)
internal class GeoRetentionIndexCandidatePostgresTest {
    @Test
    fun `global observed time candidate removes retention spill with measured write and space cost`() {
        val jdbc = fixtureJdbc()
        initializeSchema(jdbc)
        seed(jdbc, 1, HISTORY_ROWS)
        jdbc.execute("ANALYZE gcs_geo.stream_telemetry_points")
        val baselinePlan = plan(jdbc)
        val baselineInsert = insertCost(jdbc, HISTORY_ROWS + 1)
        val buildStarted = System.nanoTime()
        jdbc.execute("""CREATE INDEX idx_retention_fixture_points_time
            ON gcs_geo.stream_telemetry_points (observed_at, id)""")
        val buildMs = elapsedMs(buildStarted)
        jdbc.execute("ANALYZE gcs_geo.stream_telemetry_points")
        val candidatePlan = plan(jdbc)
        val candidateInsert = insertCost(jdbc, HISTORY_ROWS + INSERT_ROWS + 1)
        val indexBytes = requireNotNull(jdbc.queryForObject(
            "SELECT pg_relation_size('gcs_geo.idx_retention_fixture_points_time')", Long::class.java,
        ))
        val baselineNodes = nodes(baselinePlan)
        val candidateNodes = nodes(candidatePlan)
        assertTrue(baselineNodes.any { it.path("Node Type").asText() == "Sort" })
        assertTrue(baselinePlan.path("Temp Written Blocks").asLong() > 0)
        assertTrue(candidateNodes.none { it.path("Node Type").asText() == "Sort" })
        assertTrue(candidateNodes.any { it.path("Index Name").asText() == "idx_retention_fixture_points_time" })
        assertEquals(0, candidatePlan.path("Temp Written Blocks").asLong())
        assertTrue(indexBytes > 0 && buildMs >= 0)
        assertTrue(listOf(baselineInsert, candidateInsert).all { it.latencyMs in 0.0..<3_000.0 && it.walBytes > 0 })
        println("geo_retention_index result=PASS rows=$HISTORY_ROWS insert_rows=$INSERT_ROWS " +
            "baseline_sort_nodes=${baselineNodes.count { it.path("Node Type").asText() == "Sort" }} " +
            "baseline_temp_written=${baselinePlan.path("Temp Written Blocks").asLong()} baseline_plan_ms=${baselinePlan.path("Actual Total Time").asDouble()} " +
            "candidate_index_used=1 candidate_sort_nodes=0 candidate_temp_written=0 index_bytes=$indexBytes " +
            "candidate_plan_ms=${candidatePlan.path("Actual Total Time").asDouble()} build_ms=$buildMs " +
            "baseline_insert_ms=${baselineInsert.latencyMs} candidate_insert_ms=${candidateInsert.latencyMs} " +
            "baseline_insert_wal=${baselineInsert.walBytes} candidate_insert_wal=${candidateInsert.walBytes}")
    }

    private fun fixtureJdbc(): JdbcTemplate {
        val source = DriverManagerDataSource(postgres.jdbcUrl, postgres.username, postgres.password)
        return JdbcTemplate(source).apply { queryTimeout = 5 }
    }

    private fun initializeSchema(jdbc: JdbcTemplate) {
        jdbc.execute(java.nio.file.Files.readString(java.nio.file.Path.of("../../deploy/postgres/init/001_geo_telemetry.sql")))
        jdbc.execute("CREATE EXTENSION IF NOT EXISTS pg_stat_statements")
        jdbc.execute("TRUNCATE gcs_geo.stream_telemetry_points")
    }

    private fun seed(jdbc: JdbcTemplate, first: Int, rows: Int) {
        val observedAt = Instant.parse("2026-01-01T00:00:00Z").toString()
        jdbc.update("""INSERT INTO gcs_geo.stream_telemetry_points
            (org_id,group_id,asset_id,stream_id,event_id,observed_at,position,source_protocol,payload_format)
            SELECT 'fixture','co-a','fixture','fixture','candidate-'||i,CAST(? AS TIMESTAMPTZ),
            ST_SetSRID(ST_MakePoint(128,35),4326),'fixture','fixture' FROM generate_series(?,?) i""",
            observedAt, first, first + rows - 1)
    }

    private fun insertCost(jdbc: JdbcTemplate, first: Int): GeoInsertCost {
        jdbc.execute("SELECT pg_stat_statements_reset()")
        val started = System.nanoTime()
        seed(jdbc, first, INSERT_ROWS)
        val latency = elapsedMs(started)
        val wal = requireNotNull(jdbc.queryForObject("""SELECT SUM(wal_bytes) FROM pg_stat_statements
            WHERE query LIKE 'INSERT INTO gcs_geo.stream_telemetry_points%'""", Double::class.java))
        return GeoInsertCost(latency, wal)
    }

    private fun plan(jdbc: JdbcTemplate): JsonNode {
        val result = requireNotNull(jdbc.queryForObject("""EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
            SELECT p.ctid,p.tableoid FROM gcs_geo.stream_telemetry_points p
            WHERE observed_at < TIMESTAMPTZ '2026-02-01T00:00:00Z'
            ORDER BY observed_at LIMIT 1000 FOR UPDATE SKIP LOCKED""", String::class.java))
        return ObjectMapper().readTree(result)[0]["Plan"]
    }

    private fun nodes(root: JsonNode): List<JsonNode> = listOf(root) + root.path("Plans").flatMap(::nodes)
    private fun elapsedMs(started: Long) = (System.nanoTime() - started) / 1_000_000.0

    companion object {
        const val HISTORY_ROWS = 100_000
        const val INSERT_ROWS = 10_000

        @Container @JvmStatic
        private val postgres = PostgreSQLContainer<Nothing>(DockerImageName.parse(
            "postgis/postgis@sha256:44126d872ac91993766c341e369c539e8196614321765d36a6f1bab0419a5fa5",
        ).asCompatibleSubstituteFor("postgres")).apply {
            setCommand("postgres", "-c", "shared_preload_libraries=pg_stat_statements", "-c", "pg_stat_statements.track=top")
        }
    }
}
