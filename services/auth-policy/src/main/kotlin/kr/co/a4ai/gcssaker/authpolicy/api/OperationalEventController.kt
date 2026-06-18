package kr.co.a4ai.gcssaker.authpolicy.api

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
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController
import java.time.Instant

@RestController
class OperationalEventController(
    private val repository: OperationalEventRepository,
    private val principalResolver: BearerPrincipalResolver,
    private val auditPublisher: OperationalAuditPublisher = NoopOperationalAuditPublisher,
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
        source = source,
        message = message,
        connections = connections,
        latencyMs = latencyMs,
        throughputMbps = throughputMbps,
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
    )

private fun OperationalEventTimeBucket.toResponse(): OperationalEventTimeBucketResponse =
    OperationalEventTimeBucketResponse(
        bucketStart = bucketStart,
        eventCount = eventCount,
        totalConnections = totalConnections,
        avgLatencyMs = avgLatencyMs,
        avgThroughputMbps = avgThroughputMbps,
    )
