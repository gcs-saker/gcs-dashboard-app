package kr.co.a4ai.gcssaker.authpolicy.domain

import java.time.temporal.ChronoUnit

interface OperationalEventRepository {
    fun eventsFor(principal: AuthenticatedPrincipal, query: OperationalEventQuery): List<OperationalEventReadModel>

    fun eventsAfter(
        principal: AuthenticatedPrincipal,
        query: OperationalEventQuery,
        cursor: OperationalEventCursor,
        limit: OperationalEventPageLimit,
    ): List<OperationalEventReadModel> =
        eventsFor(principal, query)
            .asSequence()
            .filter { it.occurredAt > cursor.occurredAt || (it.occurredAt == cursor.occurredAt && it.id > cursor.id) }
            .sortedWith(compareBy<OperationalEventReadModel> { it.occurredAt }.thenBy { it.id })
            .take(limit.value)
            .toList()

    fun append(event: OperationalEventReadModel)

    fun metricsFor(principal: AuthenticatedPrincipal, query: OperationalEventQuery): OperationalEventMetrics {
        val events = eventsFor(principal, query)
        return events.toOperationalEventMetrics()
    }

    fun eventPageFor(principal: AuthenticatedPrincipal, query: OperationalEventPageQuery): OperationalEventPage {
        val filtered = eventsFor(principal, query.filter)
            .asSequence()
            .filter { event ->
                query.after == null ||
                    event.occurredAt.isBefore(query.after.occurredAt) ||
                    (event.occurredAt == query.after.occurredAt && event.id < query.after.id)
            }
            .sortedWith(compareByDescending<OperationalEventReadModel> { it.occurredAt }.thenByDescending { it.id })
            .take(query.limit.value + 1)
            .toList()
        val pageEvents = filtered.take(query.limit.value)
        return OperationalEventPage(
            events = pageEvents,
            nextCursor = pageEvents.lastOrNull()?.takeIf { filtered.size > query.limit.value }?.toCursor(),
        )
    }

    fun timeBucketsFor(principal: AuthenticatedPrincipal, query: OperationalEventQuery): List<OperationalEventTimeBucket> {
        return eventsFor(principal, query)
            .groupBy { it.occurredAt.truncatedTo(ChronoUnit.MINUTES) }
            .map { (bucketStart, events) ->
                OperationalEventTimeBucket(
                    bucketStart = bucketStart,
                    eventCount = events.size.toLong(),
                    totalConnections = events.sumOf { it.connections }.toLong(),
                    avgLatencyMs = events.map { it.latencyMs }.average().takeIf { !it.isNaN() },
                    avgThroughputMbps = events.map { it.throughputMbps }.average().takeIf { !it.isNaN() },
                )
            }
            .sortedBy { it.bucketStart }
    }
}
