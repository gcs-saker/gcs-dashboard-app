package kr.co.a4ai.gcssaker.authpolicy.infrastructure.persistence

import kr.co.a4ai.gcssaker.authpolicy.domain.AuthenticatedPrincipal
import kr.co.a4ai.gcssaker.authpolicy.domain.GroupId
import kr.co.a4ai.gcssaker.authpolicy.domain.OperationalEventIcePathCount
import kr.co.a4ai.gcssaker.authpolicy.domain.OperationalEventMetrics
import kr.co.a4ai.gcssaker.authpolicy.domain.OperationalEventPage
import kr.co.a4ai.gcssaker.authpolicy.domain.OperationalEventPageQuery
import kr.co.a4ai.gcssaker.authpolicy.domain.OperationalEventQuery
import kr.co.a4ai.gcssaker.authpolicy.domain.OperationalEventReadModel
import kr.co.a4ai.gcssaker.authpolicy.domain.OperationalEventRepository
import kr.co.a4ai.gcssaker.authpolicy.domain.OperationalEventSeverityCount
import kr.co.a4ai.gcssaker.authpolicy.domain.UserRole
import kr.co.a4ai.gcssaker.authpolicy.domain.toCursor
import kr.co.a4ai.gcssaker.authpolicy.domain.toStreamSessionMetrics
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
        OperationalEventSchema.ensure(dataSource)
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

    override fun append(event: OperationalEventReadModel) {
        if (!existsById(event.id)) {
            insert(event)
        }
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
        val icePathSql = StringBuilder(OperationalEventSql.selectIcePathCountsBase)
        val icePathParams = mutableListOf<Any>()
        appendFilters(icePathSql, icePathParams, principal, query)
        icePathSql.append(OperationalEventSql.andIcePathPresent)
        icePathSql.append(OperationalEventSql.groupByIcePath)
        val icePathCounts = jdbc.query(
            icePathSql.toString(),
            operationalEventIcePathCountRowMapper,
            *icePathParams.toTypedArray(),
        )
        return aggregate.copy(
            severityCounts = severityCounts,
            icePathCounts = icePathCounts,
            streamSessions = eventsFor(principal, query).toStreamSessionMetrics(),
        )
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
            params.add(likeQuery)
            params.add(likeQuery)
            params.add(likeQuery)
            params.add(likeQuery)
            params.add(likeQuery)
            params.add(likeQuery)
        }
    }

    private fun seedEvents(initialEvents: Collection<OperationalEventReadModel>) {
        initialEvents.forEach { event ->
            if (!existsById(event.id)) {
                insert(event)
            }
        }
    }

    private fun insert(event: OperationalEventReadModel) {
        jdbc.update(
            OperationalEventSql.insert,
            event.id,
            Timestamp.from(event.occurredAt),
            event.severity.lowercase(),
            event.category,
            event.eventType,
            event.sourceService,
            event.source,
            event.message,
            event.connections,
            event.latencyMs,
            event.throughputMbps,
            event.groupId.value,
            event.streamId,
            event.connectionId,
            event.icePath,
            event.relayFallbackReason,
        )
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
                eventType = rs.getString(OperationalEventColumns.eventType),
                sourceService = rs.getString(OperationalEventColumns.sourceService),
                source = rs.getString(OperationalEventColumns.source),
                message = rs.getString(OperationalEventColumns.message),
                connections = rs.getInt(OperationalEventColumns.connections),
                latencyMs = rs.getLong(OperationalEventColumns.latencyMs),
                throughputMbps = rs.getDouble(OperationalEventColumns.throughputMbps),
                groupId = GroupId(rs.getString(OperationalEventColumns.groupId)),
                streamId = rs.getString(OperationalEventColumns.streamId),
                connectionId = rs.getString(OperationalEventColumns.connectionId),
                icePath = rs.getString(OperationalEventColumns.icePath),
                relayFallbackReason = rs.getString(OperationalEventColumns.relayFallbackReason),
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
                        icePathCounts = emptyList(),
                        streamSessions = emptyList(),
                    )
                }
            }
        val operationalEventSeverityCountRowMapper = RowMapper<OperationalEventSeverityCount> { rs, _ ->
            OperationalEventSeverityCount(
                severity = rs.getString(OperationalEventColumns.severity),
                count = rs.getLong(OperationalEventMetricColumns.totalEvents),
            )
        }
        val operationalEventIcePathCountRowMapper = RowMapper<OperationalEventIcePathCount> { rs, _ ->
            OperationalEventIcePathCount(
                icePath = rs.getString(OperationalEventColumns.icePath),
                count = rs.getLong(OperationalEventMetricColumns.totalEvents),
            )
        }
    }
}

object OperationalEventSchema {
    fun ensure(dataSource: DataSource) {
        AuthPolicyJdbcMigrations.ensure(dataSource)
    }
}

private object OperationalEventColumns {
    const val id = "id"
    const val occurredAt = "occurred_at"
    const val severity = "severity"
    const val category = "category"
    const val eventType = "event_type"
    const val sourceService = "source_service"
    const val source = "source"
    const val message = "message"
    const val connections = "connections"
    const val latencyMs = "latency_ms"
    const val throughputMbps = "throughput_mbps"
    const val groupId = "group_id"
    const val streamId = "stream_id"
    const val connectionId = "connection_id"
    const val icePath = "ice_path"
    const val relayFallbackReason = "relay_fallback_reason"
}

private object OperationalEventMetricColumns {
    const val totalEvents = "total_events"
    const val totalConnections = "total_connections"
    const val minLatencyMs = "min_latency_ms"
    const val avgLatencyMs = "avg_latency_ms"
    const val maxLatencyMs = "max_latency_ms"
    const val avgThroughputMbps = "avg_throughput_mbps"
}

internal object OperationalEventSql {
    const val selectBase = """
        SELECT id, occurred_at, severity, category, event_type, source_service, source, message,
               connections, latency_ms, throughput_mbps, group_id,
               stream_id, connection_id, ice_path, relay_fallback_reason
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
    const val selectIcePathCountsBase = """
        SELECT ice_path, COUNT(1) AS total_events
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
            OR LOWER(COALESCE(event_type, '')) LIKE ?
            OR LOWER(COALESCE(source_service, '')) LIKE ?
            OR LOWER(COALESCE(stream_id, '')) LIKE ?
            OR LOWER(COALESCE(connection_id, '')) LIKE ?
            OR LOWER(COALESCE(ice_path, '')) LIKE ?
            OR LOWER(COALESCE(relay_fallback_reason, '')) LIKE ?
        )
    """
    const val andAfterCursor = " AND (occurred_at < ? OR (occurred_at = ? AND id < ?))"
    const val andIcePathPresent = " AND ice_path IS NOT NULL AND ice_path <> ''"
    const val orderByOccurredAt = " ORDER BY occurred_at DESC, id DESC"
    const val groupBySeverity = " GROUP BY severity ORDER BY severity"
    const val groupByIcePath = " GROUP BY ice_path ORDER BY ice_path"
    const val limit = " LIMIT ?"
    const val insert = """
        INSERT INTO operational_events (
            id, occurred_at, severity, category, event_type, source_service, source, message,
            connections, latency_ms, throughput_mbps, group_id,
            stream_id, connection_id, ice_path, relay_fallback_reason
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """
    const val existsById = "SELECT COUNT(1) FROM operational_events WHERE id = ?"
}
