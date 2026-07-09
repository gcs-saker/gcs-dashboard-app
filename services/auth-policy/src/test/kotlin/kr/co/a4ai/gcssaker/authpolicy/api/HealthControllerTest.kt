package kr.co.a4ai.gcssaker.authpolicy.api

import kr.co.a4ai.gcssaker.authpolicy.configuration.AllowedOrigins
import kr.co.a4ai.gcssaker.authpolicy.configuration.AuthRuntimeSettings
import kr.co.a4ai.gcssaker.authpolicy.domain.GroupId
import kr.co.a4ai.gcssaker.authpolicy.domain.SignupInvite
import kr.co.a4ai.gcssaker.authpolicy.domain.SignupInvites
import org.springframework.http.HttpStatus
import kotlin.test.Test
import kotlin.test.assertEquals

class HealthControllerTest {
    private companion object {
        const val TRUSTED_ORIGIN = "http://localhost:18080"
        const val VIEWER_INVITE_CODE = "A4AI01"
    }

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
    fun `ready endpoint reports python compatible readiness report when external dependencies are disabled`() {
        val responseEntity = HealthController(settings = testSettings()).readyz()
        val response = requireNotNull(responseEntity.body)

        assertEquals(HttpStatus.OK, responseEntity.statusCode)
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
                HealthCheckResponse(
                    name = HealthContract.CHECK_JDBC,
                    status = HealthContract.STATUS_OK,
                    required = false,
                ),
                HealthCheckResponse(
                    name = HealthContract.CHECK_REDIS,
                    status = HealthContract.STATUS_OK,
                    required = false,
                ),
            ),
            response.checks,
        )
    }

    @Test
    fun `ready endpoint returns degraded when required dependencies are not available`() {
        val responseEntity = HealthController(
            settings = testSettings(
                jdbcPersistenceEnabled = true,
                redisPrincipalCacheEnabled = true,
                redisRefreshSessionEnabled = true,
            ),
        ).readyz()
        val response = requireNotNull(responseEntity.body)

        assertEquals(HttpStatus.SERVICE_UNAVAILABLE, responseEntity.statusCode)
        assertEquals(HealthContract.STATUS_DEGRADED, response.status)
        assertEquals(
            HealthCheckResponse(
                name = HealthContract.CHECK_JDBC,
                status = HealthContract.STATUS_DEGRADED,
                required = true,
                reason = HealthContract.REASON_NOT_CONFIGURED,
            ),
            response.checks.first { it.name == HealthContract.CHECK_JDBC },
        )
        assertEquals(
            HealthCheckResponse(
                name = HealthContract.CHECK_REDIS,
                status = HealthContract.STATUS_DEGRADED,
                required = true,
                reason = HealthContract.REASON_NOT_CONFIGURED,
            ),
            response.checks.first { it.name == HealthContract.CHECK_REDIS },
        )
    }

    private fun testSettings(
        jdbcPersistenceEnabled: Boolean = false,
        redisPrincipalCacheEnabled: Boolean = false,
        redisRefreshSessionEnabled: Boolean = false,
    ): AuthRuntimeSettings =
        AuthRuntimeSettings(
            jwtSecret = "test-secret-must-be-at-least-32-characters",
            jwtIssuer = "gcs-saker-test",
            accessTokenExpireMinutes = 30,
            refreshTokenExpireMinutes = 10_080,
            refreshCookieName = "gcs_saker_refresh",
            refreshCookieSecure = false,
            refreshCookieSameSite = "lax",
            allowedOrigins = AllowedOrigins.of(setOf(TRUSTED_ORIGIN)),
            operatorUsername = "operator01",
            operatorPassword = "correct-password",
            operatorCompanyId = 1,
            operatorGroupId = "co-a",
            smokeUsername = "m7-smoke-viewer",
            smokePassword = "m7-smoke-pass",
            smokeCompanyId = 1,
            smokeGroupId = "co-a",
            signupInvites = SignupInvites.of(listOf(SignupInvite(VIEWER_INVITE_CODE, 1, GroupId("co-a")))),
            redisPrincipalCacheEnabled = redisPrincipalCacheEnabled,
            redisRefreshSessionEnabled = redisRefreshSessionEnabled,
            jdbcPersistenceEnabled = jdbcPersistenceEnabled,
        )
}
