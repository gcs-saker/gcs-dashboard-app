package kr.co.a4ai.gcssaker.authpolicy.infrastructure.persistence

import kr.co.a4ai.gcssaker.authpolicy.domain.GroupId
import kr.co.a4ai.gcssaker.authpolicy.domain.OperationalEventIcePathCount
import kr.co.a4ai.gcssaker.authpolicy.domain.OperationalEventMetrics
import kr.co.a4ai.gcssaker.authpolicy.domain.OperationalEventReadModel
import kr.co.a4ai.gcssaker.authpolicy.domain.OperationalEventSeverityCount
import org.springframework.jdbc.core.RowMapper

internal object JdbcOperationalEventRowMappers {
    val readModel = RowMapper<OperationalEventReadModel> { rs, _ ->
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

    val metrics = RowMapper<OperationalEventMetrics> { rs, _ ->
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

    val severityCount = RowMapper<OperationalEventSeverityCount> { rs, _ ->
        OperationalEventSeverityCount(
            severity = rs.getString(OperationalEventColumns.severity),
            count = rs.getLong(OperationalEventMetricColumns.totalEvents),
        )
    }

    val icePathCount = RowMapper<OperationalEventIcePathCount> { rs, _ ->
        OperationalEventIcePathCount(
            icePath = rs.getString(OperationalEventColumns.icePath),
            count = rs.getLong(OperationalEventMetricColumns.totalEvents),
        )
    }
}

internal object OperationalEventColumns {
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

internal object OperationalEventMetricColumns {
    const val totalEvents = "total_events"
    const val totalConnections = "total_connections"
    const val minLatencyMs = "min_latency_ms"
    const val avgLatencyMs = "avg_latency_ms"
    const val maxLatencyMs = "max_latency_ms"
    const val avgThroughputMbps = "avg_throughput_mbps"
}
