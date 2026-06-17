package kr.co.a4ai.gcssaker.authpolicy.api

import java.time.Instant

data class OperationalEventResponse(
    val id: String,
    val occurredAt: Instant,
    val severity: String,
    val category: String,
    val source: String,
    val message: String,
    val connections: Int,
    val latencyMs: Long,
    val throughputMbps: Double,
)

data class OperationalEventPageResponse(
    val events: List<OperationalEventResponse>,
    val nextCursor: String?,
)

data class OperationalEventSeverityCountResponse(
    val severity: String,
    val count: Long,
)

data class OperationalEventMetricsResponse(
    val totalEvents: Long,
    val totalConnections: Long,
    val minLatencyMs: Long?,
    val avgLatencyMs: Double?,
    val maxLatencyMs: Long?,
    val avgThroughputMbps: Double?,
    val severityCounts: List<OperationalEventSeverityCountResponse>,
)

data class OperationalEventTimeBucketResponse(
    val bucketStart: Instant,
    val eventCount: Long,
    val totalConnections: Long,
    val avgLatencyMs: Double?,
    val avgThroughputMbps: Double?,
)
