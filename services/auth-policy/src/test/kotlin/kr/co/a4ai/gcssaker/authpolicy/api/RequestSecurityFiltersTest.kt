package kr.co.a4ai.gcssaker.authpolicy.api

import jakarta.servlet.FilterChain
import io.micrometer.tracing.Tracer
import org.junit.jupiter.api.Assertions.assertDoesNotThrow
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.slf4j.MDC
import org.springframework.mock.web.MockFilterChain
import org.springframework.mock.web.MockHttpServletRequest
import org.springframework.mock.web.MockHttpServletResponse
import java.time.Duration
import java.lang.reflect.Proxy

class RequestSecurityFiltersTest {
    @Test
    fun `rate limiter bounds distinct tracked client keys`() {
        val limiter = FixedWindowRateLimiter(
            maxRequests = 10,
            window = Duration.ofMinutes(1),
            maxTrackedKeys = 2,
        )

        assertEquals(true, limiter.tryAcquire("client-one").allowed)
        assertEquals(true, limiter.tryAcquire("client-two").allowed)
        assertEquals(false, limiter.tryAcquire("client-three").allowed)
    }

    @Test
    fun `correlation id filter preserves caller supplied request id`() {
        val request = MockHttpServletRequest("GET", "/healthz").apply {
            addHeader(RequestTraceContract.CORRELATION_ID_HEADER, "trace-001")
        }
        val response = MockHttpServletResponse()

        CorrelationIdFilter().doFilter(request, response, MockFilterChain())

        assertEquals("trace-001", response.getHeader(RequestTraceContract.CORRELATION_ID_HEADER))
        assertEquals("trace-001", request.getAttribute(RequestTraceContract.CORRELATION_ID_ATTRIBUTE))
    }

    @Test
    fun `correlation id filter creates request id when caller omits one`() {
        val request = MockHttpServletRequest("GET", "/healthz")
        val response = MockHttpServletResponse()

        CorrelationIdFilter().doFilter(request, response, MockFilterChain())

        assertNotNull(response.getHeader(RequestTraceContract.CORRELATION_ID_HEADER))
        assertNotNull(request.getAttribute(RequestTraceContract.CORRELATION_ID_ATTRIBUTE))
    }

    @Test
    fun `correlation id filter mirrors incoming traceparent trace id`() {
        val traceId = "4bf92f3577b34da6a3ce929d0e0e4736"
        val request = MockHttpServletRequest("GET", "/healthz").apply {
            addHeader(
                RequestTraceContract.TRACEPARENT_HEADER,
                "00-$traceId-00f067aa0ba902b7-01",
            )
        }
        val response = MockHttpServletResponse()

        CorrelationIdFilter().doFilter(request, response, MockFilterChain())

        assertEquals(traceId, response.getHeader(RequestTraceContract.TRACE_ID_HEADER))
        assertEquals(traceId, request.getAttribute(RequestTraceContract.TRACE_ID_ATTRIBUTE))
    }

    @Test
    fun `correlation id filter exposes mdc only during request handling`() {
        val request = MockHttpServletRequest("GET", "/healthz").apply {
            addHeader(RequestTraceContract.CORRELATION_ID_HEADER, "corr-001")
        }
        val response = MockHttpServletResponse()
        val chain = FilterChain { _, _ ->
            assertEquals("corr-001", MDC.get(RequestTraceContract.MDC_CORRELATION_ID))
        }

        CorrelationIdFilter().doFilter(request, response, chain)

        assertNull(MDC.get(RequestTraceContract.MDC_CORRELATION_ID))
    }

    @Test
    fun `tracing failure cannot replace a successful business response`() {
        val failingTracer = Proxy.newProxyInstance(
            Tracer::class.java.classLoader,
            arrayOf(Tracer::class.java),
        ) { _, _, _ -> throw NoSuchElementException("closed tracing context") } as Tracer
        val request = MockHttpServletRequest("POST", "/policy/devices/authenticate")
        val response = MockHttpServletResponse()

        assertDoesNotThrow {
            CorrelationIdFilter(failingTracer).doFilter(request, response, MockFilterChain())
        }
        assertEquals(200, response.status)
    }

    @Test
    fun `rate limit filter rejects repeated auth requests within one window`() {
        val filter = RateLimitFilter(
            limiter = FixedWindowRateLimiter(maxRequests = 1, window = Duration.ofMinutes(1)),
            enabled = true,
        )
        val first = MockHttpServletResponse()
        val second = MockHttpServletResponse()

        filter.doFilter(authRequest(), first, MockFilterChain())
        filter.doFilter(authRequest(), second, MockFilterChain())

        assertEquals(200, first.status)
        assertEquals(429, second.status)
        val retryAfter = second.getHeader(RateLimitContract.RETRY_AFTER_HEADER)?.toLong()
        assertTrue(retryAfter in 1L..60L)
        assertTrue(second.contentAsString.contains(RateLimitContract.RATE_LIMIT_EXCEEDED))
    }

    @Test
    fun `rate limit filter covers device bootstrap registration`() {
        val filter = RateLimitFilter(
            limiter = FixedWindowRateLimiter(maxRequests = 1, window = Duration.ofMinutes(1)),
            enabled = true,
        )
        val first = MockHttpServletResponse()
        val second = MockHttpServletResponse()

        filter.doFilter(deviceBootstrapRequest(), first, MockFilterChain())
        filter.doFilter(deviceBootstrapRequest(), second, MockFilterChain())

        assertEquals(200, first.status)
        assertEquals(429, second.status)
    }

    @Test
    fun `api access log filter records request path status and correlation id`() {
        val sink = RecordingApiAccessLogSink()
        val request = MockHttpServletRequest("GET", "/auth-policy/healthz").apply {
            remoteAddr = "203.0.113.20"
            setAttribute(RequestTraceContract.CORRELATION_ID_ATTRIBUTE, "corr-002")
        }
        val response = MockHttpServletResponse()
        val chain = FilterChain { _, servletResponse ->
            (servletResponse as MockHttpServletResponse).status = 204
        }

        ApiAccessLogFilter(sink).doFilter(request, response, chain)

        assertEquals(1, sink.records.size)
        assertEquals("GET", sink.records.single().method)
        assertEquals("/auth-policy/healthz", sink.records.single().path)
        assertEquals(204, sink.records.single().status)
        assertEquals("corr-002", sink.records.single().correlationId)
        assertEquals("203.0.113.20", sink.records.single().remoteAddress)
    }

    private fun authRequest(): MockHttpServletRequest =
        MockHttpServletRequest("POST", RateLimitContract.LOGIN_PATH).apply {
            remoteAddr = "203.0.113.10"
        }

    private fun deviceBootstrapRequest(): MockHttpServletRequest =
        MockHttpServletRequest("POST", RateLimitContract.DEVICE_BOOTSTRAP_PATH).apply {
            remoteAddr = "203.0.113.20"
        }

    private class RecordingApiAccessLogSink : ApiAccessLogSink {
        val records = mutableListOf<ApiAccessRecord>()

        override fun append(record: ApiAccessRecord) {
            records.add(record)
        }
    }
}
