package kr.co.a4ai.gcssaker.authpolicy.api

import jakarta.servlet.FilterChain
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.web.filter.OncePerRequestFilter
import io.micrometer.tracing.Tracer
import org.slf4j.MDC
import java.time.Clock
import java.time.Duration
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

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
}

object RateLimitContract {
    const val RETRY_AFTER_HEADER = "Retry-After"
    const val ERROR_DETAIL_FIELD = "detail"
    const val RATE_LIMIT_EXCEEDED = "rate limit exceeded"
    const val LOGIN_PATH = AuthApiRoutes.ROOT + AuthApiRoutes.LOGIN
    const val REFRESH_PATH = AuthApiRoutes.ROOT + AuthApiRoutes.REFRESH
    const val SIGNUP_PATH = AuthApiRoutes.ROOT + AuthApiRoutes.SIGNUP
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
        this?.currentSpan()?.context()?.traceId()?.takeIf { it.isNotBlank() }
}

class RateLimitFilter(
    private val limiter: FixedWindowRateLimiter,
    private val enabled: Boolean,
) : OncePerRequestFilter() {
    override fun doFilterInternal(
        request: HttpServletRequest,
        response: HttpServletResponse,
        filterChain: FilterChain,
    ) {
        if (!enabled || !request.isRateLimitedAuthPath()) {
            filterChain.doFilter(request, response)
            return
        }

        val key = "${request.remoteAddr}:${request.requestURI}"
        val decision = limiter.tryAcquire(key)
        if (decision.allowed) {
            filterChain.doFilter(request, response)
            return
        }

        response.status = HttpStatus.TOO_MANY_REQUESTS.value()
        response.contentType = MediaType.APPLICATION_JSON_VALUE
        response.setHeader(RateLimitContract.RETRY_AFTER_HEADER, decision.retryAfterSeconds.toString())
        response.writer.write("""{"${RateLimitContract.ERROR_DETAIL_FIELD}":"${RateLimitContract.RATE_LIMIT_EXCEEDED}"}""")
    }

    private fun HttpServletRequest.isRateLimitedAuthPath(): Boolean =
        method.equals(HttpMethods.POST, ignoreCase = true) &&
            requestURI in RATE_LIMITED_AUTH_PATHS

    private companion object {
        val RATE_LIMITED_AUTH_PATHS = setOf(
            RateLimitContract.LOGIN_PATH,
            RateLimitContract.REFRESH_PATH,
            RateLimitContract.SIGNUP_PATH,
        )
    }
}

class FixedWindowRateLimiter(
    private val maxRequests: Int,
    private val window: Duration,
    private val clock: Clock = Clock.systemUTC(),
) {
    private val windows = ConcurrentHashMap<String, WindowCounter>()

    fun tryAcquire(key: String): RateLimitDecision {
        if (maxRequests <= 0) return RateLimitDecision.denied(window.seconds)
        val nowMillis = clock.millis()
        val windowMillis = window.toMillis().coerceAtLeast(1)
        val next = windows.compute(key) { _, current ->
            if (current == null || nowMillis >= current.resetAtMillis) {
                WindowCounter(count = 1, resetAtMillis = nowMillis + windowMillis)
            } else {
                current.copy(count = current.count + 1)
            }
        } ?: WindowCounter(count = 1, resetAtMillis = nowMillis + windowMillis)

        if (next.count <= maxRequests) {
            return RateLimitDecision.allowed()
        }
        return RateLimitDecision.denied(((next.resetAtMillis - nowMillis) / 1000).coerceAtLeast(1))
    }

    private data class WindowCounter(
        val count: Int,
        val resetAtMillis: Long,
    )
}

data class RateLimitDecision(
    val allowed: Boolean,
    val retryAfterSeconds: Long,
) {
    companion object {
        fun allowed(): RateLimitDecision = RateLimitDecision(true, 0)

        fun denied(retryAfterSeconds: Long): RateLimitDecision =
            RateLimitDecision(false, retryAfterSeconds)
    }
}

private object HttpMethods {
    const val POST = "POST"
}
