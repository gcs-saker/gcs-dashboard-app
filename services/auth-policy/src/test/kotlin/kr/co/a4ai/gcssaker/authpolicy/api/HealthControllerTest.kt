package kr.co.a4ai.gcssaker.authpolicy.api

import kotlin.test.Test
import kotlin.test.assertEquals

class HealthControllerTest {
    @Test
    fun `health endpoint reports python compatible liveness report`() {
        val response = HealthController().healthz()

        assertEquals("ok", response.status)
        assertEquals("auth-policy", response.service)
        assertEquals(listOf(HealthCheckResponse(name = "api", status = "ok", required = true)), response.checks)
    }

    @Test
    fun `ready endpoint reports python compatible readiness report`() {
        val response = HealthController().readyz()

        assertEquals("ok", response.status)
        assertEquals("auth-policy", response.service)
        assertEquals(
            listOf(
                HealthCheckResponse(name = "auth_repository", status = "ok", required = true),
                HealthCheckResponse(name = "jwt_token_service", status = "ok", required = true),
                HealthCheckResponse(name = "stream_policy", status = "ok", required = true),
            ),
            response.checks,
        )
    }
}
