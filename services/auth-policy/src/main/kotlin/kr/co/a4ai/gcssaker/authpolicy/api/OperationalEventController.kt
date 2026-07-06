package kr.co.a4ai.gcssaker.authpolicy.api

import com.fasterxml.jackson.databind.ObjectMapper
import kr.co.a4ai.gcssaker.authpolicy.application.NoopOperationalAuditPublisher
import kr.co.a4ai.gcssaker.authpolicy.application.OperationalAuditPublisher
import kr.co.a4ai.gcssaker.authpolicy.domain.OperationalEventRepository
import org.springframework.http.CacheControl
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody

@RestController
class OperationalEventController(
    private val repository: OperationalEventRepository,
    private val principalResolver: BearerPrincipalResolver,
    private val auditPublisher: OperationalAuditPublisher = NoopOperationalAuditPublisher,
    private val objectMapper: ObjectMapper,
    private val streamPolicy: OperationalEventStreamPolicy = OperationalEventStreamPolicy(),
) {
    private val requests = OperationalEventRequestReader(principalResolver)
    private val streamWriter = OperationalEventStreamWriter(repository, objectMapper, streamPolicy)

    @GetMapping(OperationalEventApiRoutes.EVENTS)
    @RequiresBearerAuth
    fun events(
        @RequestHeader(AuthSecurityHeaders.AUTHORIZATION_HEADER_NAME, required = false) authorization: String?,
        @RequestParam(required = false) query: String?,
        @RequestParam(required = false) severity: String?,
        @RequestParam(required = false) from: String?,
        @RequestParam(required = false) to: String?,
    ): List<OperationalEventResponse> {
        val context = requests.context(authorization, query, severity, from, to)
        val events = repository.eventsFor(context.principal, context.query)
        auditPublisher.publish(context.principal, context.query, events.size)
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
        val context = requests.context(authorization, query, severity, from, to)
        val page = repository.eventPageFor(context.principal, requests.pageQuery(context.query, limit, after))
        auditPublisher.publish(context.principal, context.query, page.events.size)
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
        val context = requests.context(authorization, query, severity, from, to)
        return ResponseEntity.ok()
            .contentType(MediaType.TEXT_EVENT_STREAM)
            .cacheControl(CacheControl.noStore())
            .header(OperationalEventStreamContract.HEADER_ACCEL_BUFFERING, OperationalEventStreamContract.HEADER_VALUE_NO)
            .body(streamWriter.body(context.principal, context.query))
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
        val context = requests.context(authorization, query, severity, from, to)
        val metrics = repository.metricsFor(context.principal, context.query)
        auditPublisher.publish(context.principal, context.query, metrics.totalEvents.coerceAtMost(Int.MAX_VALUE.toLong()).toInt())
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
        val context = requests.context(authorization, query, severity, from, to)
        val buckets = repository.timeBucketsFor(context.principal, context.query)
        auditPublisher.publish(context.principal, context.query, buckets.size)
        return buckets.map { it.toResponse() }
    }
}
