package kr.co.a4ai.gcssaker.authpolicy.api

import com.fasterxml.jackson.databind.ObjectMapper
import kr.co.a4ai.gcssaker.authpolicy.application.NoopOperationalEventSignal
import kr.co.a4ai.gcssaker.authpolicy.application.OperationalEventSignal
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
import kotlin.math.min

class OperationalEventStreamWriter(
    private val repository: OperationalEventRepository,
    private val objectMapper: ObjectMapper,
    private val streamPolicy: OperationalEventStreamPolicy,
    private val metrics: OperationalEventPipelineMetrics = OperationalEventPipelineMetrics(),
    private val signal: OperationalEventSignal = NoopOperationalEventSignal,
    private val nanoTime: () -> Long = System::nanoTime,
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
                    ?: OperationalEventCursor(Instant.now(), STREAM_START_CURSOR_ID)
                writeIncrementalEvents(output, principal, query, cursor)
            } finally {
                metrics.streamClosed()
            }
        }

    private fun writeIncrementalEvents(
        output: java.io.OutputStream,
        principal: AuthenticatedPrincipal,
        query: OperationalEventQuery,
        initialCursor: OperationalEventCursor,
    ) {
        var cursor = initialCursor
        var signalVersion = signal.snapshot()
        val durationMillis = streamPolicy.pollCount.toLong() * streamPolicy.pollIntervalMillis
        val deadlineNanos = nanoTime() + TimeUnit.MILLISECONDS.toNanos(durationMillis)
        while (true) {
            cursor = writeBatchAndHeartbeat(output, principal, query, cursor)
            if (durationMillis == 0L) return
            val remainingNanos = deadlineNanos - nanoTime()
            if (remainingNanos <= 0) return
            val waitMillis = min(streamPolicy.fallbackPollIntervalMillis, nanosToCeilingMillis(remainingNanos))
            val nextVersion = awaitSignal(signalVersion, waitMillis) ?: return
            metrics.recordWait(nextVersion != signalVersion)
            signalVersion = nextVersion
        }
    }

    private fun writeBatchAndHeartbeat(
        output: java.io.OutputStream,
        principal: AuthenticatedPrincipal,
        query: OperationalEventQuery,
        cursor: OperationalEventCursor,
    ): OperationalEventCursor {
        val events = metrics.measureQuery {
            repository.eventsAfter(principal, query, cursor, OperationalEventPageLimit(BATCH_LIMIT))
        }
        metrics.recordBatch(events.size, BATCH_LIMIT)
        events.forEach { event ->
            output.writeOperationalEventSseEvent(EVENT_OPERATIONAL_EVENT, event.toResponse(), objectMapper)
        }
        output.writeOperationalEventSseEvent(
            EVENT_HEARTBEAT,
            OperationalEventStreamHeartbeatResponse(Instant.now()),
            objectMapper,
        )
        output.flush()
        return events.lastOrNull()?.toCursor() ?: cursor
    }

    private fun awaitSignal(version: Long, timeoutMillis: Long): Long? =
        try {
            signal.awaitChange(version, timeoutMillis)
        } catch (_: InterruptedException) {
            Thread.currentThread().interrupt()
            null
        }

    private fun nanosToCeilingMillis(nanos: Long): Long =
        (nanos + TimeUnit.MILLISECONDS.toNanos(1) - 1) / TimeUnit.MILLISECONDS.toNanos(1)

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
        const val STREAM_START_CURSOR_ID = "!"
    }
}
