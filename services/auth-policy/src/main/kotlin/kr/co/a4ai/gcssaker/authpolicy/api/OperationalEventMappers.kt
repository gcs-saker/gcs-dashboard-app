package kr.co.a4ai.gcssaker.authpolicy.api

import kr.co.a4ai.gcssaker.authpolicy.domain.OperationalEventMetrics
import kr.co.a4ai.gcssaker.authpolicy.domain.OperationalEventReadModel
import kr.co.a4ai.gcssaker.authpolicy.domain.OperationalEventTimeBucket

internal fun OperationalEventReadModel.toResponse(): OperationalEventResponse =
    OperationalEventResponse(
        id = id,
        occurredAt = occurredAt,
        severity = severity,
        category = category,
        eventType = eventType,
        sourceService = sourceService,
        source = source,
        message = message,
        connections = connections,
        latencyMs = latencyMs,
        throughputMbps = throughputMbps,
        streamId = streamId,
        connectionId = connectionId,
        icePath = icePath,
        relayFallbackReason = relayFallbackReason,
    )

internal fun OperationalEventMetrics.toResponse(): OperationalEventMetricsResponse =
    OperationalEventMetricsResponse(
        totalEvents = totalEvents,
        totalConnections = totalConnections,
        minLatencyMs = minLatencyMs,
        avgLatencyMs = avgLatencyMs,
        maxLatencyMs = maxLatencyMs,
        avgThroughputMbps = avgThroughputMbps,
        severityCounts = severityCounts.map {
            OperationalEventSeverityCountResponse(it.severity, it.count)
        },
        icePathCounts = icePathCounts.map {
            OperationalEventIcePathCountResponse(it.icePath, it.count)
        },
        streamSessions = streamSessions.map {
            OperationalStreamSessionMetricResponse(
                streamId = it.streamId,
                connectionId = it.connectionId,
                lastOccurredAt = it.lastOccurredAt,
                eventCount = it.eventCount,
                averageLatencyMs = it.averageLatencyMs,
                averageThroughputMbps = it.averageThroughputMbps,
                icePath = it.icePath,
                relayFallbackReason = it.relayFallbackReason,
            )
        },
    )

internal fun OperationalEventTimeBucket.toResponse(): OperationalEventTimeBucketResponse =
    OperationalEventTimeBucketResponse(
        bucketStart = bucketStart,
        eventCount = eventCount,
        totalConnections = totalConnections,
        avgLatencyMs = avgLatencyMs,
        avgThroughputMbps = avgThroughputMbps,
    )
