package kr.co.a4ai.gcssaker.authpolicy.domain

import java.time.Instant
import java.time.temporal.ChronoUnit
import java.util.Base64

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

@JvmInline
value class OperationalEventPageLimit(val value: Int) {
    init {
        require(value in MIN_VALUE..MAX_VALUE) { "operational event page limit must be between $MIN_VALUE and $MAX_VALUE" }
    }

    companion object {
        const val MIN_VALUE = 1
        const val MAX_VALUE = 100
        val DEFAULT = OperationalEventPageLimit(50)

        fun from(raw: Int?): OperationalEventPageLimit =
            raw?.coerceIn(MIN_VALUE, MAX_VALUE)?.let(::OperationalEventPageLimit) ?: DEFAULT
    }
}

data class OperationalEventCursor(
    val occurredAt: Instant,
    val id: String,
) {
    init {
        require(id.isNotBlank()) { "operational event cursor id must not be blank" }
    }

    fun encode(): String {
        val raw = "${occurredAt}|$id"
        return Base64.getUrlEncoder().withoutPadding().encodeToString(raw.toByteArray(Charsets.UTF_8))
    }

    companion object {
        fun decode(raw: String?): OperationalEventCursor? {
            if (raw.isNullOrBlank()) {
                return null
            }
            return runCatching {
                val decoded = String(Base64.getUrlDecoder().decode(raw), Charsets.UTF_8)
                val parts = decoded.split("|", limit = 2)
                require(parts.size == 2)
                OperationalEventCursor(Instant.parse(parts[0]), parts[1])
            }.getOrNull()
        }
    }
}

interface OperationalEventRepository {
    fun eventsFor(principal: AuthenticatedPrincipal, query: OperationalEventQuery): List<OperationalEventReadModel>

    fun metricsFor(principal: AuthenticatedPrincipal, query: OperationalEventQuery): OperationalEventMetrics {
        val events = eventsFor(principal, query)
        if (events.isEmpty()) {
            return OperationalEventMetrics.empty()
        }
        return OperationalEventMetrics(
            totalEvents = events.size.toLong(),
            totalConnections = events.sumOf { it.connections }.toLong(),
            minLatencyMs = events.minOf { it.latencyMs },
            avgLatencyMs = events.map { it.latencyMs }.average(),
            maxLatencyMs = events.maxOf { it.latencyMs },
            avgThroughputMbps = events.map { it.throughputMbps }.average(),
            severityCounts = events
                .groupingBy { it.severity }
                .eachCount()
                .map { (severity, count) -> OperationalEventSeverityCount(severity, count.toLong()) }
                .sortedBy { it.severity },
            icePathCounts = events
                .mapNotNull { it.icePath?.takeIf(String::isNotBlank) }
                .groupingBy { it }
                .eachCount()
                .map { (icePath, count) -> OperationalEventIcePathCount(icePath, count.toLong()) }
                .sortedBy { it.icePath },
            streamSessions = events.toStreamSessionMetrics(),
        )
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

class InMemoryOperationalEventRepository(
    events: Collection<OperationalEventReadModel>,
) : OperationalEventRepository {
    private val events = events.sortedByDescending { it.occurredAt }

    override fun eventsFor(
        principal: AuthenticatedPrincipal,
        query: OperationalEventQuery,
    ): List<OperationalEventReadModel> =
        events
            .asSequence()
            .filter { it.groupId == principal.groupId || principal.role == UserRole.ADMIN }
            .filter { event -> query.query.isNullOrBlank() || event.matchesQuery(query.query) }
            .filter { event -> query.severity.isNullOrBlank() || event.severity.equals(query.severity, ignoreCase = true) }
            .filter { event -> query.from == null || !event.occurredAt.isBefore(query.from) }
            .filter { event -> query.to == null || !event.occurredAt.isAfter(query.to) }
            .sortedWith(compareByDescending<OperationalEventReadModel> { it.occurredAt }.thenByDescending { it.id })
            .toList()

    private fun OperationalEventReadModel.matchesQuery(rawQuery: String): Boolean {
        val normalizedQuery = rawQuery.trim().lowercase()
        return source.lowercase().contains(normalizedQuery) ||
            message.lowercase().contains(normalizedQuery) ||
            category.lowercase().contains(normalizedQuery) ||
            eventType.orEmpty().lowercase().contains(normalizedQuery) ||
            sourceService.orEmpty().lowercase().contains(normalizedQuery) ||
            streamId.orEmpty().lowercase().contains(normalizedQuery) ||
            connectionId.orEmpty().lowercase().contains(normalizedQuery) ||
            icePath.orEmpty().lowercase().contains(normalizedQuery) ||
            relayFallbackReason.orEmpty().lowercase().contains(normalizedQuery)
    }
}

fun OperationalEventReadModel.toCursor(): OperationalEventCursor =
    OperationalEventCursor(occurredAt = occurredAt, id = id)

fun List<OperationalEventReadModel>.toStreamSessionMetrics(): List<OperationalStreamSessionMetric> =
    asSequence()
        .filter { !it.streamId.isNullOrBlank() }
        .groupBy { "${it.streamId}|${it.connectionId.orEmpty()}" }
        .values
        .map { events ->
            val newest = events.maxWith(compareBy<OperationalEventReadModel> { it.occurredAt }.thenBy { it.id })
            OperationalStreamSessionMetric(
                streamId = requireNotNull(newest.streamId),
                connectionId = newest.connectionId,
                lastOccurredAt = newest.occurredAt,
                eventCount = events.size.toLong(),
                averageLatencyMs = events.map { it.latencyMs }.average().takeIf { !it.isNaN() },
                averageThroughputMbps = events.map { it.throughputMbps }.average().takeIf { !it.isNaN() },
                icePath = newest.icePath,
                relayFallbackReason = newest.relayFallbackReason,
            )
        }
        .sortedByDescending { it.lastOccurredAt }
        .toList()
