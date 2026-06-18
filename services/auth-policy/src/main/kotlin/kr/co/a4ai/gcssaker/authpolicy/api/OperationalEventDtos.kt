package kr.co.a4ai.gcssaker.authpolicy.api

import java.time.Instant

data class OperationalEventResponse(
    val id: String,
    val occurredAt: Instant,
    val severity: String,
    val category: String,
    val eventType: String?,
    val sourceService: String?,
    val source: String,
    val message: String,
    val connections: Int,
    val latencyMs: Long,
    val throughputMbps: Double,
    val streamId: String?,
    val connectionId: String?,
    val icePath: String?,
    val relayFallbackReason: String?,
)

data class OperationalEventPageResponse(
    val events: List<OperationalEventResponse>,
    val nextCursor: String?,
)

data class OperationalEventStreamHeartbeatResponse(
    val checkedAt: Instant,
)

data class OperationalEventSeverityCountResponse(
    val severity: String,
    val count: Long,
)

data class OperationalEventIcePathCountResponse(
    val icePath: String,
    val count: Long,
)

data class OperationalStreamSessionMetricResponse(
    val streamId: String,
    val connectionId: String?,
    val lastOccurredAt: Instant,
    val eventCount: Long,
    val averageLatencyMs: Double?,
    val averageThroughputMbps: Double?,
    val icePath: String?,
    val relayFallbackReason: String?,
)

data class OperationalEventMetricsResponse(
    val totalEvents: Long,
    val totalConnections: Long,
    val minLatencyMs: Long?,
    val avgLatencyMs: Double?,
    val maxLatencyMs: Long?,
    val avgThroughputMbps: Double?,
    val severityCounts: List<OperationalEventSeverityCountResponse>,
    val icePathCounts: List<OperationalEventIcePathCountResponse>,
    val streamSessions: List<OperationalStreamSessionMetricResponse>,
)

data class OperationalEventTimeBucketResponse(
    val bucketStart: Instant,
    val eventCount: Long,
    val totalConnections: Long,
    val avgLatencyMs: Double?,
    val avgThroughputMbps: Double?,
)
