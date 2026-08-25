package kr.co.a4ai.gcssaker.authpolicy.api

import com.fasterxml.jackson.databind.ObjectMapper
import kr.co.a4ai.gcssaker.authpolicy.domain.AuthenticatedPrincipal
import kr.co.a4ai.gcssaker.authpolicy.domain.OperationalEventQuery
import kr.co.a4ai.gcssaker.authpolicy.domain.OperationalEventRepository
import kr.co.a4ai.gcssaker.authpolicy.domain.OperationalEventPageLimit
import kr.co.a4ai.gcssaker.authpolicy.domain.OperationalEventPageQuery
import kr.co.a4ai.gcssaker.authpolicy.domain.OperationalEventCursor
import kr.co.a4ai.gcssaker.authpolicy.domain.toCursor
import kr.co.a4ai.gcssaker.authpolicy.observability.OperationalEventPipelineMetrics
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody
import java.time.Instant
import java.util.concurrent.TimeUnit

class OperationalEventStreamWriter(
    private val repository: OperationalEventRepository,
    private val objectMapper: ObjectMapper,
    private val streamPolicy: OperationalEventStreamPolicy,
    private val metrics: OperationalEventPipelineMetrics = OperationalEventPipelineMetrics(),
) {
    fun body(
        principal: AuthenticatedPrincipal,
        query: OperationalEventQuery,
        initialCursor: OperationalEventCursor? = null,
    ): StreamingResponseBody =
        StreamingResponseBody { output ->
            metrics.streamOpened()
            try {
                var cursor = initialCursor
                    ?: writeInitialPage(output, principal, query)
                    ?: OperationalEventCursor(Instant.now(), "")
                repeat(streamPolicy.pollCount) { index ->
                    val events = metrics.measureQuery {
                        repository.eventsAfter(principal, query, cursor, OperationalEventPageLimit(BATCH_LIMIT))
                    }
                    metrics.recordBatch(events.size, BATCH_LIMIT)
                    events.forEach { event ->
                        output.writeOperationalEventSseEvent(EVENT_OPERATIONAL_EVENT, event.toResponse(), objectMapper)
                    }
                    cursor = events.lastOrNull()?.toCursor() ?: cursor
                    output.writeOperationalEventSseEvent(
                        EVENT_HEARTBEAT,
                        OperationalEventStreamHeartbeatResponse(Instant.now()),
                        objectMapper,
                    )
                    output.flush()
                    if (index < streamPolicy.pollCount - 1 && streamPolicy.pollIntervalMillis > 0) {
                        TimeUnit.MILLISECONDS.sleep(streamPolicy.pollIntervalMillis)
                    }
                }
            } finally {
                metrics.streamClosed()
            }
        }

    private fun writeInitialPage(
        output: java.io.OutputStream,
        principal: AuthenticatedPrincipal,
        query: OperationalEventQuery,
    ) = metrics.measureQuery {
        repository.eventPageFor(
            principal,
            OperationalEventPageQuery(query, OperationalEventPageLimit(INITIAL_LIMIT)),
        ).events
    }.also { events ->
        metrics.recordBatch(events.size, INITIAL_LIMIT)
        events.asReversed().forEach { event ->
            output.writeOperationalEventSseEvent(EVENT_OPERATIONAL_EVENT, event.toResponse(), objectMapper)
        }
    }.firstOrNull()?.toCursor()

    private companion object {
        const val BATCH_LIMIT = OperationalEventStreamContract.BATCH_LIMIT
        const val INITIAL_LIMIT = 10
        const val EVENT_OPERATIONAL_EVENT = OperationalEventStreamContract.EVENT_OPERATIONAL_EVENT
        const val EVENT_HEARTBEAT = OperationalEventStreamContract.EVENT_HEARTBEAT
    }
}
