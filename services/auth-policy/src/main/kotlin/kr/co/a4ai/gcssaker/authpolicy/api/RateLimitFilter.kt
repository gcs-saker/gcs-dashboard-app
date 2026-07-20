package kr.co.a4ai.gcssaker.authpolicy.api

import jakarta.servlet.FilterChain
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.web.filter.OncePerRequestFilter
import java.time.Clock
import java.time.Duration
import java.util.concurrent.ConcurrentHashMap

object RateLimitContract {
    const val RETRY_AFTER_HEADER = "Retry-After"
    const val ERROR_DETAIL_FIELD = "detail"
    const val RATE_LIMIT_EXCEEDED = "rate limit exceeded"
    const val LOGIN_PATH = AuthApiRoutes.ROOT + AuthApiRoutes.LOGIN
    const val REFRESH_PATH = AuthApiRoutes.ROOT + AuthApiRoutes.REFRESH
    const val SIGNUP_PATH = AuthApiRoutes.ROOT + AuthApiRoutes.SIGNUP
    const val DEVICE_BOOTSTRAP_PATH = DeviceBootstrapApiRoutes.ROOT + DeviceBootstrapApiRoutes.REGISTER
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
            RateLimitContract.DEVICE_BOOTSTRAP_PATH,
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
