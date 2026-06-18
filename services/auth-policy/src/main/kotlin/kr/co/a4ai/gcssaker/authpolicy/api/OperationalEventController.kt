package kr.co.a4ai.gcssaker.authpolicy.api

import com.fasterxml.jackson.databind.ObjectMapper
import kr.co.a4ai.gcssaker.authpolicy.application.NoopOperationalAuditPublisher
import kr.co.a4ai.gcssaker.authpolicy.application.OperationalAuditPublisher
import kr.co.a4ai.gcssaker.authpolicy.domain.OperationalEventCursor
import kr.co.a4ai.gcssaker.authpolicy.domain.OperationalEventMetrics
import kr.co.a4ai.gcssaker.authpolicy.domain.OperationalEventPageLimit
import kr.co.a4ai.gcssaker.authpolicy.domain.OperationalEventPageQuery
import kr.co.a4ai.gcssaker.authpolicy.domain.OperationalEventQuery
import kr.co.a4ai.gcssaker.authpolicy.domain.OperationalEventReadModel
import kr.co.a4ai.gcssaker.authpolicy.domain.OperationalEventRepository
import kr.co.a4ai.gcssaker.authpolicy.domain.OperationalEventTimeBucket
import org.springframework.http.CacheControl
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody
import java.time.Instant
import java.util.concurrent.TimeUnit

@RestController
class OperationalEventController(
    private val repository: OperationalEventRepository,
    private val principalResolver: BearerPrincipalResolver,
    private val auditPublisher: OperationalAuditPublisher = NoopOperationalAuditPublisher,
    private val objectMapper: ObjectMapper,
    private val streamPolicy: OperationalEventStreamPolicy = OperationalEventStreamPolicy(),
) {
    @GetMapping(OperationalEventApiRoutes.EVENTS)
    @RequiresBearerAuth
    fun events(
        @RequestHeader(AuthSecurityHeaders.AUTHORIZATION_HEADER_NAME, required = false) authorization: String?,
        @RequestParam(required = false) query: String?,
        @RequestParam(required = false) severity: String?,
        @RequestParam(required = false) from: String?,
        @RequestParam(required = false) to: String?,
    ): List<OperationalEventResponse> {
        val principal = principalResolver.requirePrincipal(authorization)
        val eventQuery = OperationalEventQuery(
            query = query,
            severity = severity?.takeUnless { it.equals(OperationalEventQueryValues.ALL, ignoreCase = true) },
            from = parseInstantQuery(OperationalEventQueryFields.FROM, from),
            to = parseInstantQuery(OperationalEventQueryFields.TO, to),
        )
        val events = repository.eventsFor(principal, eventQuery)
        auditPublisher.publish(principal, eventQuery, events.size)
        return events.map { it.toResponse() }
    }

    @GetMapping(OperationalEventApiRoutes.EVENTS_PAGE)
    @RequiresBearerAuth
    fun eventPage(
        @RequestHeader(AuthSecurityHeaders.AUTHORIZATION_HEADER_NAME, required = false) authorization: String?,
        @RequestParam(required = false) query: String?,
        @RequestParam(required = false) severity: String?,
        @RequestParam(required = false) from: String?,
        @RequestParam(required = false) to: String?,
        @RequestParam(required = false) limit: Int?,
        @RequestParam(required = false) after: String?,
    ): OperationalEventPageResponse {
        val principal = principalResolver.requirePrincipal(authorization)
        val eventQuery = OperationalEventQuery(
            query = query,
            severity = severity?.takeUnless { it.equals(OperationalEventQueryValues.ALL, ignoreCase = true) },
            from = parseInstantQuery(OperationalEventQueryFields.FROM, from),
            to = parseInstantQuery(OperationalEventQueryFields.TO, to),
        )
        val page = repository.eventPageFor(
            principal,
            OperationalEventPageQuery(
                filter = eventQuery,
                limit = OperationalEventPageLimit.from(limit),
                after = OperationalEventCursor.decode(after),
            ),
        )
        auditPublisher.publish(principal, eventQuery, page.events.size)
        return OperationalEventPageResponse(
            events = page.events.map { it.toResponse() },
            nextCursor = page.nextCursor?.encode(),
        )
    }

    @GetMapping(OperationalEventApiRoutes.EVENTS_STREAM, produces = [MediaType.TEXT_EVENT_STREAM_VALUE])
    @RequiresBearerAuth
    fun eventStream(
        @RequestHeader(AuthSecurityHeaders.AUTHORIZATION_HEADER_NAME, required = false) authorization: String?,
        @RequestParam(required = false) query: String?,
        @RequestParam(required = false) severity: String?,
        @RequestParam(required = false) from: String?,
        @RequestParam(required = false) to: String?,
    ): ResponseEntity<StreamingResponseBody> {
        val principal = principalResolver.requirePrincipal(authorization)
        val eventQuery = OperationalEventQuery(
            query = query,
            severity = severity?.takeUnless { it.equals(OperationalEventQueryValues.ALL, ignoreCase = true) },
            from = parseInstantQuery(OperationalEventQueryFields.FROM, from),
            to = parseInstantQuery(OperationalEventQueryFields.TO, to),
        )
        val stream = StreamingResponseBody { output ->
            val deliveredIds = LinkedHashSet<String>()
            repeat(streamPolicy.pollCount) { index ->
                val events = repository.eventsFor(principal, eventQuery)
                for (event in events.asReversed()) {
                    if (deliveredIds.add(event.id)) {
                        output.writeSseEvent(OperationalEventStreamContract.EVENT_OPERATIONAL_EVENT, event.toResponse(), objectMapper)
                    }
                }
                output.writeSseEvent(
                    OperationalEventStreamContract.EVENT_HEARTBEAT,
                    OperationalEventStreamHeartbeatResponse(Instant.now()),
                    objectMapper,
                )
                output.flush()
                if (index < streamPolicy.pollCount - 1 && streamPolicy.pollIntervalMillis > 0) {
                    TimeUnit.MILLISECONDS.sleep(streamPolicy.pollIntervalMillis)
                }
            }
        }
        return ResponseEntity.ok()
            .contentType(MediaType.TEXT_EVENT_STREAM)
            .cacheControl(CacheControl.noStore())
            .header(OperationalEventStreamContract.HEADER_ACCEL_BUFFERING, OperationalEventStreamContract.HEADER_VALUE_NO)
            .body(stream)
    }

    @GetMapping(OperationalEventApiRoutes.EVENTS_METRICS)
    @RequiresBearerAuth
    fun metrics(
        @RequestHeader(AuthSecurityHeaders.AUTHORIZATION_HEADER_NAME, required = false) authorization: String?,
        @RequestParam(required = false) query: String?,
        @RequestParam(required = false) severity: String?,
        @RequestParam(required = false) from: String?,
        @RequestParam(required = false) to: String?,
    ): OperationalEventMetricsResponse {
        val principal = principalResolver.requirePrincipal(authorization)
        val eventQuery = OperationalEventQuery(
            query = query,
            severity = severity?.takeUnless { it.equals(OperationalEventQueryValues.ALL, ignoreCase = true) },
            from = parseInstantQuery(OperationalEventQueryFields.FROM, from),
            to = parseInstantQuery(OperationalEventQueryFields.TO, to),
        )
        val metrics = repository.metricsFor(principal, eventQuery)
        auditPublisher.publish(principal, eventQuery, metrics.totalEvents.coerceAtMost(Int.MAX_VALUE.toLong()).toInt())
        return metrics.toResponse()
    }

    @GetMapping(OperationalEventApiRoutes.EVENTS_BUCKETS)
    @RequiresBearerAuth
    fun buckets(
        @RequestHeader(AuthSecurityHeaders.AUTHORIZATION_HEADER_NAME, required = false) authorization: String?,
        @RequestParam(required = false) query: String?,
        @RequestParam(required = false) severity: String?,
        @RequestParam(required = false) from: String?,
        @RequestParam(required = false) to: String?,
    ): List<OperationalEventTimeBucketResponse> {
        val principal = principalResolver.requirePrincipal(authorization)
        val eventQuery = OperationalEventQuery(
            query = query,
            severity = severity?.takeUnless { it.equals(OperationalEventQueryValues.ALL, ignoreCase = true) },
            from = parseInstantQuery(OperationalEventQueryFields.FROM, from),
            to = parseInstantQuery(OperationalEventQueryFields.TO, to),
        )
        val buckets = repository.timeBucketsFor(principal, eventQuery)
        auditPublisher.publish(principal, eventQuery, buckets.size)
        return buckets.map { it.toResponse() }
    }
}

data class OperationalEventStreamPolicy(
    val pollCount: Int = OperationalEventStreamContract.DEFAULT_POLL_COUNT,
    val pollIntervalMillis: Long = OperationalEventStreamContract.DEFAULT_POLL_INTERVAL_MILLIS,
) {
    init {
        require(pollCount in 1..OperationalEventStreamContract.MAX_POLL_COUNT)
        require(pollIntervalMillis >= 0)
    }
}

object OperationalEventStreamContract {
    const val DEFAULT_POLL_COUNT = 30
    const val MAX_POLL_COUNT = 120
    const val DEFAULT_POLL_INTERVAL_MILLIS = 1_000L
    const val EVENT_OPERATIONAL_EVENT = "operational-event"
    const val EVENT_HEARTBEAT = "heartbeat"
    const val FIELD_EVENT = "event"
    const val FIELD_DATA = "data"
    const val HEADER_ACCEL_BUFFERING = "X-Accel-Buffering"
    const val HEADER_VALUE_NO = "no"
}

private fun java.io.OutputStream.writeSseEvent(eventName: String, payload: Any, objectMapper: ObjectMapper) {
    write("${OperationalEventStreamContract.FIELD_EVENT}: $eventName\n".toByteArray(Charsets.UTF_8))
    write("${OperationalEventStreamContract.FIELD_DATA}: ${objectMapper.writeValueAsString(payload)}\n\n".toByteArray(Charsets.UTF_8))
}

private fun parseInstantQuery(name: String, value: String?): Instant? {
    if (value.isNullOrBlank()) {
        return null
    }
    return runCatching { Instant.parse(value) }
        .getOrElse { throw BadRequestApiError("$name ${OperationalEventApiErrors.INSTANT_QUERY_REQUIRED}") }
}

private fun OperationalEventReadModel.toResponse(): OperationalEventResponse =
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

private fun OperationalEventMetrics.toResponse(): OperationalEventMetricsResponse =
    OperationalEventMetricsResponse(
        totalEvents = totalEvents,
        totalConnections = totalConnections,
        minLatencyMs = minLatencyMs,
        avgLatencyMs = avgLatencyMs,
        maxLatencyMs = maxLatencyMs,
        avgThroughputMbps = avgThroughputMbps,
        severityCounts = severityCounts.map {
            OperationalEventSeverityCountResponse(
                severity = it.severity,
                count = it.count,
            )
        },
        icePathCounts = icePathCounts.map {
            OperationalEventIcePathCountResponse(
                icePath = it.icePath,
                count = it.count,
            )
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

private fun OperationalEventTimeBucket.toResponse(): OperationalEventTimeBucketResponse =
    OperationalEventTimeBucketResponse(
        bucketStart = bucketStart,
        eventCount = eventCount,
        totalConnections = totalConnections,
        avgLatencyMs = avgLatencyMs,
        avgThroughputMbps = avgThroughputMbps,
    )
