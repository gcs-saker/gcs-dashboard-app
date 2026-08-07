package kr.co.a4ai.gcssaker.authpolicy.api

import jakarta.servlet.FilterChain
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.springframework.web.filter.OncePerRequestFilter
import io.micrometer.tracing.Tracer
import org.slf4j.MDC
import org.slf4j.LoggerFactory
import java.util.concurrent.TimeUnit
import java.util.UUID

object RequestTraceContract {
    const val CORRELATION_ID_HEADER = "X-GCS-Correlation-Id"
    const val TRACE_ID_HEADER = "X-GCS-Trace-Id"
    const val TRACEPARENT_HEADER = "traceparent"
    const val CORRELATION_ID_ATTRIBUTE = "gcs.correlationId"
    const val TRACE_ID_ATTRIBUTE = "gcs.traceId"
    const val MDC_CORRELATION_ID = "correlationId"
    const val MDC_TRACE_ID = "traceId"
    const val MAX_CORRELATION_ID_LENGTH = 128
    const val TRACE_ID_LENGTH = 32
    const val TRACEPARENT_PARTS = 4
    val EXPOSED_HEADERS = listOf(CORRELATION_ID_HEADER, TRACE_ID_HEADER)
}

class CorrelationIdFilter(
    private val tracer: Tracer? = null,
) : OncePerRequestFilter() {
    override fun doFilterInternal(
        request: HttpServletRequest,
        response: HttpServletResponse,
        filterChain: FilterChain,
    ) {
        val correlationId = request.getHeader(RequestTraceContract.CORRELATION_ID_HEADER)
            ?.trim()
            ?.takeIf { it.isNotEmpty() && it.length <= RequestTraceContract.MAX_CORRELATION_ID_LENGTH }
            ?: UUID.randomUUID().toString()
        request.setAttribute(RequestTraceContract.CORRELATION_ID_ATTRIBUTE, correlationId)
        response.setHeader(RequestTraceContract.CORRELATION_ID_HEADER, correlationId)
        val incomingTraceId = request.traceIdFromTraceParent()
        val initialTraceId = tracer.currentTraceIdOrNull() ?: incomingTraceId
        initialTraceId?.let { traceId ->
            request.setAttribute(RequestTraceContract.TRACE_ID_ATTRIBUTE, traceId)
            response.setHeader(RequestTraceContract.TRACE_ID_HEADER, traceId)
        }

        MDC.put(RequestTraceContract.MDC_CORRELATION_ID, correlationId)
        initialTraceId?.let { MDC.put(RequestTraceContract.MDC_TRACE_ID, it) }
        try {
            filterChain.doFilter(request, response)
        } finally {
            val finalTraceId = tracer.currentTraceIdOrNull() ?: initialTraceId
            finalTraceId?.let { traceId ->
                request.setAttribute(RequestTraceContract.TRACE_ID_ATTRIBUTE, traceId)
                response.setHeader(RequestTraceContract.TRACE_ID_HEADER, traceId)
            }
            MDC.remove(RequestTraceContract.MDC_TRACE_ID)
            MDC.remove(RequestTraceContract.MDC_CORRELATION_ID)
        }
    }

    private fun HttpServletRequest.traceIdFromTraceParent(): String? {
        val traceParent = getHeader(RequestTraceContract.TRACEPARENT_HEADER)?.trim() ?: return null
        val parts = traceParent.split("-")
        if (parts.size != RequestTraceContract.TRACEPARENT_PARTS) return null
        return parts[1]
            .takeIf { it.length == RequestTraceContract.TRACE_ID_LENGTH }
            ?.takeIf { value -> value.all { it in '0'..'9' || it in 'a'..'f' } }
            ?.takeIf { value -> value.any { it != '0' } }
    }

    private fun Tracer?.currentTraceIdOrNull(): String? =
        runCatching { this?.currentSpan()?.context()?.traceId()?.takeIf { it.isNotBlank() } }
            .getOrNull()
}

object ApiAccessLogContract {
    const val LOG_NAME = "gcs.api.access"
    const val UNKNOWN_VALUE = "-"
}

data class ApiAccessRecord(
    val method: String,
    val path: String,
    val status: Int,
    val durationMs: Long,
    val correlationId: String,
    val traceId: String,
    val remoteAddress: String,
)

interface ApiAccessLogSink {
    fun append(record: ApiAccessRecord)
}

class Slf4jApiAccessLogSink : ApiAccessLogSink {
    private val logger = LoggerFactory.getLogger(ApiAccessLogContract.LOG_NAME)

    override fun append(record: ApiAccessRecord) {
        logger.info(
            "api_access method={} path={} status={} durationMs={} correlationId={} traceId={} remote={}",
            record.method,
            record.path,
            record.status,
            record.durationMs,
            record.correlationId,
            record.traceId,
            record.remoteAddress,
        )
    }
}

class ApiAccessLogFilter(
    private val sink: ApiAccessLogSink,
    private val clientIpResolver: ClientIpResolver = ClientIpResolver(),
) : OncePerRequestFilter() {
    override fun doFilterInternal(
        request: HttpServletRequest,
        response: HttpServletResponse,
        filterChain: FilterChain,
    ) {
        val startedAt = System.nanoTime()
        try {
            filterChain.doFilter(request, response)
        } finally {
            sink.append(request.toAccessRecord(response, startedAt))
        }
    }

    private fun HttpServletRequest.toAccessRecord(
        response: HttpServletResponse,
        startedAt: Long,
    ): ApiAccessRecord =
        ApiAccessRecord(
            method = method,
            path = requestURI,
            status = response.status,
            durationMs = TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - startedAt),
            correlationId = attributeOrUnknown(RequestTraceContract.CORRELATION_ID_ATTRIBUTE),
            traceId = attributeOrUnknown(RequestTraceContract.TRACE_ID_ATTRIBUTE),
            remoteAddress = clientIpResolver.resolve(this),
        )

    private fun HttpServletRequest.attributeOrUnknown(name: String): String =
        getAttribute(name)?.toString()?.takeIf { it.isNotBlank() }
            ?: ApiAccessLogContract.UNKNOWN_VALUE
}
