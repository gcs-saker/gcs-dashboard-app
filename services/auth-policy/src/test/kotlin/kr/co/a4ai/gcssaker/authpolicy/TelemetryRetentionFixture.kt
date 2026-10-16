package kr.co.a4ai.gcssaker.authpolicy

import kr.co.a4ai.gcssaker.authpolicy.infrastructure.persistence.*
import org.springframework.jdbc.datasource.DataSourceTransactionManager
import org.springframework.transaction.support.TransactionTemplate
import org.testcontainers.containers.PostgreSQLContainer
import java.nio.file.Files
import java.nio.file.Path
import java.time.Instant
import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper

internal data class RetentionBatchInput(val days: Int? = 30, val size: Int? = 1000, val anchor: String?)
internal data class RetentionBatchResult(val history: Long, val points: Long, val more: Boolean)
internal enum class RetentionHistoryTable(val sqlTable: String, val timeColumn: String) {
    HISTORY("public.telemetry_history", "recorded_at"), POINTS("gcs_geo.stream_telemetry_points", "observed_at"),
}

internal class TelemetryRetentionFixture(postgres: PostgreSQLContainer<*>) : AutoCloseable {
    val runtime = TelemetryWriterLoadFixture(postgres)
    val jdbc = runtime.jdbc
    val transactions = TransactionTemplate(DataSourceTransactionManager(runtime.pool)).apply { timeout = 5 }
    lateinit var anchor: Instant
    val call = "SELECT * FROM public.prune_telemetry_history_batch(?, ?, CAST(? AS TIMESTAMPTZ))"

    fun initialize() {
        runtime.initialize()
        jdbc.execute(Files.readString(Path.of("../../deploy/postgres/init/001_geo_telemetry.sql")))
    }

    fun reset() {
        jdbc.execute("DROP TRIGGER IF EXISTS reject_retention_fixture ON gcs_geo.stream_telemetry_points")
        jdbc.execute("TRUNCATE telemetry_latest, telemetry_history, gcs_geo.stream_telemetry_points, gcs_geo.stream_telemetry_latest")
        anchor = requireNotNull(jdbc.queryForObject("SELECT date_trunc('milliseconds', CURRENT_TIMESTAMP)", java.sql.Timestamp::class.java)).toInstant()
        runtime.writer.replaceTelemetry(runtime.sample(0).copy(observedAt = anchor, eventId = "live-fixture"))
        jdbc.update("""INSERT INTO gcs_geo.stream_telemetry_latest
            (org_id,group_id,asset_id,stream_id,event_id,observed_at,position,source_protocol,payload_format)
            VALUES ('fixture','co-a','fixture','fixture','live-fixture',CAST(? AS TIMESTAMPTZ),ST_SetSRID(ST_MakePoint(128,35),4326),'fixture','fixture')""", anchor.toString())
        jdbc.execute("SELECT pg_stat_statements_reset()")
    }

    fun input(size: Int = 1000) = RetentionBatchInput(size = size, anchor = anchor.toString())

    fun prune(input: RetentionBatchInput = input()): RetentionBatchResult = requireNotNull(transactions.execute {
        jdbc.execute("SET LOCAL statement_timeout = '2s'")
        jdbc.execute("SET LOCAL lock_timeout = '500ms'")
        query(input)
    })

    fun query(input: RetentionBatchInput): RetentionBatchResult = jdbc.queryForObject(call, { row, _ ->
        RetentionBatchResult(row.getLong(1), row.getLong(2), row.getBoolean(3))
    }, input.days, input.size, input.anchor) ?: error("retention_result_missing")

    fun seed(rows: Int, observedAt: Instant = anchor.minusSeconds(31 * DAY_SECONDS)) {
        for (first in 1..rows step SEED_SIZE) {
            val end = minOf(first + SEED_SIZE - 1, rows)
            jdbc.update("""INSERT INTO telemetry_history
                (event_id,uuid,recorded_at,latitude,longitude,altitude,magnetic_x,magnetic_y,magnetic_z,
                 soc,phone_battery_soc,velocity,total_distance,epoch_time,port_distance,group_id,observed_at)
                SELECT 'expired-'||i, 'fixture-device-0', CAST(? AS TIMESTAMPTZ),35,128,0,0,0,0,'50',50,0,0,'0',0,'co-a',CAST(? AS TIMESTAMPTZ)
                FROM generate_series(?,?) i""", observedAt.toString(), observedAt.toString(), first, end)
            jdbc.update("""INSERT INTO gcs_geo.stream_telemetry_points
                (org_id,group_id,asset_id,stream_id,event_id,observed_at,position,source_protocol,payload_format)
                SELECT 'fixture','co-a','fixture','fixture','expired-'||i,CAST(? AS TIMESTAMPTZ),
                ST_SetSRID(ST_MakePoint(128,35),4326),'fixture','fixture' FROM generate_series(?,?) i""", observedAt.toString(), first, end)
        }
    }

    fun counts() = jdbc.queryForObject("""SELECT (SELECT COUNT(*) FROM telemetry_history) AS history,
        (SELECT COUNT(*) FROM gcs_geo.stream_telemetry_points) AS points""", { row, _ -> row.getLong(1) to row.getLong(2) })

    fun assertLatest() {
        org.junit.jupiter.api.Assertions.assertEquals("live-fixture", jdbc.queryForObject("SELECT event_id FROM telemetry_latest", String::class.java))
        org.junit.jupiter.api.Assertions.assertEquals("live-fixture", jdbc.queryForObject("SELECT event_id FROM gcs_geo.stream_telemetry_latest", String::class.java))
    }

    fun candidatePlan(history: RetentionHistoryTable): JsonNode {
        val sql = """EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) SELECT h.ctid, h.tableoid FROM ${history.sqlTable} h
            WHERE h.${history.timeColumn} < CAST(? AS TIMESTAMPTZ) ORDER BY h.${history.timeColumn}
            LIMIT 1000 FOR UPDATE SKIP LOCKED"""
        val result = requireNotNull(jdbc.queryForObject(sql, String::class.java,
            anchor.minusSeconds(30 * DAY_SECONDS).toString()))
        return ObjectMapper().readTree(result)[0]["Plan"]
    }

    fun planNodes(root: JsonNode): List<JsonNode> = listOf(root) + root.path("Plans").flatMap(::planNodes)

    override fun close() = runtime.close()

    companion object {
        const val DAY_SECONDS = 86400L
        const val SEED_SIZE = 1000
    }
}
