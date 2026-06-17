package kr.co.a4ai.gcssaker.authpolicy.infrastructure.persistence

import kr.co.a4ai.gcssaker.authpolicy.domain.AuthenticatedPrincipal
import kr.co.a4ai.gcssaker.authpolicy.domain.GroupId
import kr.co.a4ai.gcssaker.authpolicy.domain.OperationalEventMetrics
import kr.co.a4ai.gcssaker.authpolicy.domain.OperationalEventPage
import kr.co.a4ai.gcssaker.authpolicy.domain.OperationalEventPageQuery
import kr.co.a4ai.gcssaker.authpolicy.domain.OperationalEventQuery
import kr.co.a4ai.gcssaker.authpolicy.domain.OperationalEventReadModel
import kr.co.a4ai.gcssaker.authpolicy.domain.OperationalEventRepository
import kr.co.a4ai.gcssaker.authpolicy.domain.OperationalEventSeverityCount
import kr.co.a4ai.gcssaker.authpolicy.domain.UserRole
import kr.co.a4ai.gcssaker.authpolicy.domain.toCursor
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.core.RowMapper
import java.sql.Timestamp
import java.time.Instant
import javax.sql.DataSource

class JdbcOperationalEventRepository(
    dataSource: DataSource,
    initialEvents: Collection<OperationalEventReadModel>,
) : OperationalEventRepository {
    private val jdbc = JdbcTemplate(dataSource)

    init {
        OperationalEventSchema.ensure(jdbc)
        seedEvents(initialEvents)
    }

    override fun eventsFor(
        principal: AuthenticatedPrincipal,
        query: OperationalEventQuery,
    ): List<OperationalEventReadModel> {
        val sql = StringBuilder(OperationalEventSql.selectBase)
        val params = mutableListOf<Any>()
        appendFilters(sql, params, principal, query)
        sql.append(OperationalEventSql.orderByOccurredAt)
        return jdbc.query(sql.toString(), operationalEventRowMapper, *params.toTypedArray())
    }

    override fun eventPageFor(
        principal: AuthenticatedPrincipal,
        query: OperationalEventPageQuery,
    ): OperationalEventPage {
        val sql = StringBuilder(OperationalEventSql.selectBase)
        val params = mutableListOf<Any>()
        appendFilters(sql, params, principal, query.filter)
        query.after?.let { cursor ->
            sql.append(OperationalEventSql.andAfterCursor)
            params.add(Timestamp.from(cursor.occurredAt))
            params.add(Timestamp.from(cursor.occurredAt))
            params.add(cursor.id)
        }
        sql.append(OperationalEventSql.orderByOccurredAt)
        sql.append(OperationalEventSql.limit)
        params.add(query.limit.value + 1)
        val pageWithExtra = jdbc.query(sql.toString(), operationalEventRowMapper, *params.toTypedArray())
        val events = pageWithExtra.take(query.limit.value)
        return OperationalEventPage(
            events = events,
            nextCursor = events.lastOrNull()?.takeIf { pageWithExtra.size > query.limit.value }?.toCursor(),
        )
    }

    override fun metricsFor(
        principal: AuthenticatedPrincipal,
        query: OperationalEventQuery,
    ): OperationalEventMetrics {
        val aggregateSql = StringBuilder(OperationalEventSql.selectMetricsBase)
        val aggregateParams = mutableListOf<Any>()
        appendFilters(aggregateSql, aggregateParams, principal, query)
        val aggregate = jdbc.queryForObject(
            aggregateSql.toString(),
            operationalEventMetricsRowMapper,
            *aggregateParams.toTypedArray(),
        ) ?: OperationalEventMetrics.empty()

        val severitySql = StringBuilder(OperationalEventSql.selectSeverityCountsBase)
        val severityParams = mutableListOf<Any>()
        appendFilters(severitySql, severityParams, principal, query)
        severitySql.append(OperationalEventSql.groupBySeverity)
        val severityCounts = jdbc.query(
            severitySql.toString(),
            operationalEventSeverityCountRowMapper,
            *severityParams.toTypedArray(),
        )
        return aggregate.copy(severityCounts = severityCounts)
    }

    private fun appendFilters(
        sql: StringBuilder,
        params: MutableList<Any>,
        principal: AuthenticatedPrincipal,
        query: OperationalEventQuery,
    ) {
        params.add(principal.groupId.value)
        params.add(principal.role.name)
        params.add(UserRole.ADMIN.name)
        if (!query.severity.isNullOrBlank()) {
            sql.append(OperationalEventSql.andSeverity)
            params.add(query.severity.lowercase())
        }
        if (query.from != null) {
            sql.append(OperationalEventSql.andOccurredAtFrom)
            params.add(Timestamp.from(query.from))
        }
        if (query.to != null) {
            sql.append(OperationalEventSql.andOccurredAtTo)
            params.add(Timestamp.from(query.to))
        }
        if (!query.query.isNullOrBlank()) {
            val likeQuery = "%${query.query.trim().lowercase()}%"
            sql.append(OperationalEventSql.andTextQuery)
            params.add(likeQuery)
            params.add(likeQuery)
            params.add(likeQuery)
        }
    }

    private fun seedEvents(initialEvents: Collection<OperationalEventReadModel>) {
        initialEvents.forEach { event ->
            if (!existsById(event.id)) {
                jdbc.update(
                    OperationalEventSql.insert,
                    event.id,
                    Timestamp.from(event.occurredAt),
                    event.severity.lowercase(),
                    event.category,
                    event.source,
                    event.message,
                    event.connections,
                    event.latencyMs,
                    event.throughputMbps,
                    event.groupId.value,
                )
            }
        }
    }

    private fun existsById(id: String): Boolean =
        (jdbc.queryForObject(OperationalEventSql.existsById, Int::class.java, id) ?: 0) > 0

    private companion object {
        val operationalEventRowMapper = RowMapper<OperationalEventReadModel> { rs, _ ->
            OperationalEventReadModel(
                id = rs.getString(OperationalEventColumns.id),
                occurredAt = rs.getTimestamp(OperationalEventColumns.occurredAt).toInstant(),
                severity = rs.getString(OperationalEventColumns.severity),
                category = rs.getString(OperationalEventColumns.category),
                source = rs.getString(OperationalEventColumns.source),
                message = rs.getString(OperationalEventColumns.message),
                connections = rs.getInt(OperationalEventColumns.connections),
                latencyMs = rs.getLong(OperationalEventColumns.latencyMs),
                throughputMbps = rs.getDouble(OperationalEventColumns.throughputMbps),
                groupId = GroupId(rs.getString(OperationalEventColumns.groupId)),
            )
        }
        val operationalEventMetricsRowMapper = RowMapper<OperationalEventMetrics> { rs, _ ->
            val totalEvents = rs.getLong(OperationalEventMetricColumns.totalEvents)
            if (totalEvents == 0L) {
                OperationalEventMetrics.empty()
            } else {
                OperationalEventMetrics(
                    totalEvents = totalEvents,
                    totalConnections = rs.getLong(OperationalEventMetricColumns.totalConnections),
                    minLatencyMs = rs.getLong(OperationalEventMetricColumns.minLatencyMs),
                    avgLatencyMs = rs.getDouble(OperationalEventMetricColumns.avgLatencyMs),
                    maxLatencyMs = rs.getLong(OperationalEventMetricColumns.maxLatencyMs),
                    avgThroughputMbps = rs.getDouble(OperationalEventMetricColumns.avgThroughputMbps),
                    severityCounts = emptyList(),
                )
            }
        }
        val operationalEventSeverityCountRowMapper = RowMapper<OperationalEventSeverityCount> { rs, _ ->
            OperationalEventSeverityCount(
                severity = rs.getString(OperationalEventColumns.severity),
                count = rs.getLong(OperationalEventMetricColumns.totalEvents),
            )
        }
    }
}

object OperationalEventSchema {
    fun ensure(jdbc: JdbcTemplate) {
        jdbc.execute(OperationalEventSql.createTable)
        OperationalEventSql.alterTimestampColumns.forEach { statement -> runCatching { jdbc.execute(statement) } }
        jdbc.createIndexIfMissing(OperationalEventSql.groupOccurredIndex)
        jdbc.createIndexIfMissing(OperationalEventSql.groupSeverityOccurredIndex)
    }
}

private object OperationalEventColumns {
    const val id = "id"
    const val occurredAt = "occurred_at"
    const val severity = "severity"
    const val category = "category"
    const val source = "source"
    const val message = "message"
    const val connections = "connections"
    const val latencyMs = "latency_ms"
    const val throughputMbps = "throughput_mbps"
    const val groupId = "group_id"
}

private object OperationalEventMetricColumns {
    const val totalEvents = "total_events"
    const val totalConnections = "total_connections"
    const val minLatencyMs = "min_latency_ms"
    const val avgLatencyMs = "avg_latency_ms"
    const val maxLatencyMs = "max_latency_ms"
    const val avgThroughputMbps = "avg_throughput_mbps"
}

private object OperationalEventSql {
    const val table = "operational_events"
    const val groupOccurredIndexName = "ix_operational_events_group_occurred"
    const val groupSeverityOccurredIndexName = "ix_operational_events_group_severity_occurred"
    const val createTable = """
        CREATE TABLE IF NOT EXISTS operational_events (
            id VARCHAR(128) NOT NULL PRIMARY KEY,
            occurred_at DATETIME(3) NOT NULL,
            severity VARCHAR(32) NOT NULL,
            category VARCHAR(64) NOT NULL,
            source VARCHAR(128) NOT NULL,
            message VARCHAR(1024) NOT NULL,
            connections INT NOT NULL,
            latency_ms BIGINT NOT NULL,
            throughput_mbps DOUBLE NOT NULL,
            group_id VARCHAR(64) NOT NULL
        )
    """
    val groupOccurredIndex = JdbcIndexDefinition(
        name = groupOccurredIndexName,
        table = table,
        columns = listOf(OperationalEventColumns.groupId, OperationalEventColumns.occurredAt),
    )
    val groupSeverityOccurredIndex = JdbcIndexDefinition(
        name = groupSeverityOccurredIndexName,
        table = table,
        columns = listOf(OperationalEventColumns.groupId, OperationalEventColumns.severity, OperationalEventColumns.occurredAt),
    )
    val alterTimestampColumns = listOf(
        "ALTER TABLE $table MODIFY ${OperationalEventColumns.occurredAt} DATETIME(3) NOT NULL",
    )
    const val selectBase = """
        SELECT id, occurred_at, severity, category, source, message,
               connections, latency_ms, throughput_mbps, group_id
        FROM operational_events
        WHERE (group_id = ? OR ? = ?)
    """
    const val selectMetricsBase = """
        SELECT COUNT(1) AS total_events,
               COALESCE(SUM(connections), 0) AS total_connections,
               MIN(latency_ms) AS min_latency_ms,
               AVG(latency_ms) AS avg_latency_ms,
               MAX(latency_ms) AS max_latency_ms,
               AVG(throughput_mbps) AS avg_throughput_mbps
        FROM operational_events
        WHERE (group_id = ? OR ? = ?)
    """
    const val selectSeverityCountsBase = """
        SELECT severity, COUNT(1) AS total_events
        FROM operational_events
        WHERE (group_id = ? OR ? = ?)
    """
    const val andSeverity = " AND severity = ?"
    const val andOccurredAtFrom = " AND occurred_at >= ?"
    const val andOccurredAtTo = " AND occurred_at <= ?"
    const val andTextQuery = """
        AND (
            LOWER(source) LIKE ?
            OR LOWER(message) LIKE ?
            OR LOWER(category) LIKE ?
        )
    """
    const val andAfterCursor = " AND (occurred_at < ? OR (occurred_at = ? AND id < ?))"
    const val orderByOccurredAt = " ORDER BY occurred_at DESC, id DESC"
    const val groupBySeverity = " GROUP BY severity ORDER BY severity"
    const val limit = " LIMIT ?"
    const val insert = """
        INSERT INTO operational_events (
            id, occurred_at, severity, category, source, message,
            connections, latency_ms, throughput_mbps, group_id
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """
    const val existsById = "SELECT COUNT(1) FROM operational_events WHERE id = ?"
}
