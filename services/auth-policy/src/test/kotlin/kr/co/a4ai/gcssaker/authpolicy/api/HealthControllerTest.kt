package kr.co.a4ai.gcssaker.authpolicy.api

import kotlin.test.Test
import kotlin.test.assertEquals

class HealthControllerTest {
    @Test
    fun `health endpoint reports python compatible liveness report`() {
        val response = HealthController().healthz()

        assertEquals(HealthContract.STATUS_OK, response.status)
        assertEquals(HealthContract.SERVICE_NAME, response.service)
        assertEquals(
            listOf(
                HealthCheckResponse(
                    name = HealthContract.CHECK_API,
                    status = HealthContract.STATUS_OK,
                    required = true,
                ),
            ),
            response.checks,
        )
    }

    @Test
    fun `ready endpoint reports python compatible readiness report`() {
        val response = HealthController().readyz()

        assertEquals(HealthContract.STATUS_OK, response.status)
        assertEquals(HealthContract.SERVICE_NAME, response.service)
        assertEquals(
            listOf(
                HealthCheckResponse(
                    name = HealthContract.CHECK_AUTH_REPOSITORY,
                    status = HealthContract.STATUS_OK,
                    required = true,
                ),
                HealthCheckResponse(
                    name = HealthContract.CHECK_JWT_TOKEN_SERVICE,
                    status = HealthContract.STATUS_OK,
                    required = true,
                ),
                HealthCheckResponse(
                    name = HealthContract.CHECK_STREAM_POLICY,
                    status = HealthContract.STATUS_OK,
                    required = true,
                ),
            ),
            response.checks,
        )
    }
}
