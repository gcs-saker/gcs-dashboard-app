package kr.co.a4ai.gcssaker.authpolicy.domain

fun List<OperationalEventReadModel>.toOperationalEventMetrics(): OperationalEventMetrics {
    if (isEmpty()) {
        return OperationalEventMetrics.empty()
    }
    return OperationalEventMetrics(
        totalEvents = size.toLong(),
        totalConnections = sumOf { it.connections }.toLong(),
        minLatencyMs = minOf { it.latencyMs },
        avgLatencyMs = map { it.latencyMs }.average(),
        maxLatencyMs = maxOf { it.latencyMs },
        avgThroughputMbps = map { it.throughputMbps }.average(),
        severityCounts = toSeverityCounts(),
        icePathCounts = toIcePathCounts(),
        streamSessions = toStreamSessionMetrics(),
    )
}

fun List<OperationalEventReadModel>.toStreamSessionMetrics(): List<OperationalStreamSessionMetric> =
    asSequence()
        .filter { !it.streamId.isNullOrBlank() }
        .groupBy { "${it.streamId}|${it.connectionId.orEmpty()}" }
        .values
        .map { events -> events.toStreamSessionMetric() }
        .sortedByDescending { it.lastOccurredAt }
        .toList()

private fun List<OperationalEventReadModel>.toSeverityCounts(): List<OperationalEventSeverityCount> =
    groupingBy { it.severity }
        .eachCount()
        .map { (severity, count) -> OperationalEventSeverityCount(severity, count.toLong()) }
        .sortedBy { it.severity }

private fun List<OperationalEventReadModel>.toIcePathCounts(): List<OperationalEventIcePathCount> =
    mapNotNull { it.icePath?.takeIf(String::isNotBlank) }
        .groupingBy { it }
        .eachCount()
        .map { (icePath, count) -> OperationalEventIcePathCount(icePath, count.toLong()) }
        .sortedBy { it.icePath }

private fun List<OperationalEventReadModel>.toStreamSessionMetric(): OperationalStreamSessionMetric {
    val newest = maxWith(compareBy<OperationalEventReadModel> { it.occurredAt }.thenBy { it.id })
    return OperationalStreamSessionMetric(
        streamId = requireNotNull(newest.streamId),
        connectionId = newest.connectionId,
        lastOccurredAt = newest.occurredAt,
        eventCount = size.toLong(),
        averageLatencyMs = map { it.latencyMs }.average().takeIf { !it.isNaN() },
        averageThroughputMbps = map { it.throughputMbps }.average().takeIf { !it.isNaN() },
        icePath = newest.icePath,
        relayFallbackReason = newest.relayFallbackReason,
    )
}
