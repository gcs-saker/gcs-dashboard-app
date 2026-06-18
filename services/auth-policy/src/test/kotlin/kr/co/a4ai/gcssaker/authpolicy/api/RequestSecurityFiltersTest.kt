package kr.co.a4ai.gcssaker.authpolicy.api

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.springframework.mock.web.MockFilterChain
import org.springframework.mock.web.MockHttpServletRequest
import org.springframework.mock.web.MockHttpServletResponse
import java.time.Duration

class RequestSecurityFiltersTest {
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

    private fun authRequest(): MockHttpServletRequest =
        MockHttpServletRequest("POST", RateLimitContract.LOGIN_PATH).apply {
            remoteAddr = "203.0.113.10"
        }
}
