package kr.co.a4ai.gcssaker.authpolicy.domain

import java.time.Instant

data class OperationalEventReadModel(
    val id: String,
    val occurredAt: Instant,
    val severity: String,
    val category: String,
    val eventType: String? = null,
    val sourceService: String? = null,
    val source: String,
    val message: String,
    val connections: Int,
    val latencyMs: Long,
    val throughputMbps: Double,
    val groupId: GroupId,
    val streamId: String? = null,
    val connectionId: String? = null,
    val icePath: String? = null,
    val relayFallbackReason: String? = null,
    val traceId: String? = null,
    val actorId: String? = null,
    val operation: String? = null,
    val result: String? = null,
    val errorCode: String? = null,
    val clockStatus: String? = null,
    val previousHash: String? = null,
    val eventHash: String? = null,
    val receivedAt: Instant? = null,
    val timeSource: String? = null,
    val clockDriftMs: Long? = null,
    val clockMeasuredAt: Instant? = null,
)

data class OperationalEventQuery(
    val query: String? = null,
    val severity: String? = null,
    val from: Instant? = null,
    val to: Instant? = null,
)

data class OperationalEventPageQuery(
    val filter: OperationalEventQuery = OperationalEventQuery(),
    val limit: OperationalEventPageLimit = OperationalEventPageLimit.DEFAULT,
    val after: OperationalEventCursor? = null,
)

data class OperationalEventPage(
    val events: List<OperationalEventReadModel>,
    val nextCursor: OperationalEventCursor?,
)

data class OperationalEventSeverityCount(
    val severity: String,
    val count: Long,
)

data class OperationalEventIcePathCount(
    val icePath: String,
    val count: Long,
)

data class OperationalStreamSessionMetric(
    val streamId: String,
    val connectionId: String?,
    val lastOccurredAt: Instant,
    val eventCount: Long,
    val averageLatencyMs: Double?,
    val averageThroughputMbps: Double?,
    val icePath: String?,
    val relayFallbackReason: String?,
)

data class OperationalEventMetrics(
    val totalEvents: Long,
    val totalConnections: Long,
    val minLatencyMs: Long?,
    val avgLatencyMs: Double?,
    val maxLatencyMs: Long?,
    val avgThroughputMbps: Double?,
    val severityCounts: List<OperationalEventSeverityCount>,
    val icePathCounts: List<OperationalEventIcePathCount> = emptyList(),
    val streamSessions: List<OperationalStreamSessionMetric> = emptyList(),
) {
    companion object {
        fun empty(): OperationalEventMetrics =
            OperationalEventMetrics(
                totalEvents = 0,
                totalConnections = 0,
                minLatencyMs = null,
                avgLatencyMs = null,
                maxLatencyMs = null,
                avgThroughputMbps = null,
                severityCounts = emptyList(),
                icePathCounts = emptyList(),
                streamSessions = emptyList(),
            )
    }
}

data class OperationalEventTimeBucket(
    val bucketStart: Instant,
    val eventCount: Long,
    val totalConnections: Long,
    val avgLatencyMs: Double?,
    val avgThroughputMbps: Double?,
)
