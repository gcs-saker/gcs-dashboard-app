package kr.co.a4ai.gcssaker.authpolicy

import org.springframework.core.env.MapPropertySource
import org.springframework.core.env.StandardEnvironment
import kr.co.a4ai.gcssaker.authpolicy.domain.NoopPrincipalCache
import kr.co.a4ai.gcssaker.authpolicy.domain.StatelessRefreshSessionStore
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

class AuthPolicyConfigTest {
    @Test
    fun `runtime settings prefer auth policy env and parse csv origins`() {
        val env = StandardEnvironment()
        env.propertySources.addFirst(
            MapPropertySource(
                "test",
                mapOf(
                    "AUTH_POLICY_JWT_SECRET" to "policy-secret-at-least-32-characters",
                    "AUTH_POLICY_JWT_ISSUER" to "policy-issuer",
                    "AUTH_POLICY_ACCESS_TOKEN_EXPIRE_MINUTES" to "15",
                    "AUTH_POLICY_REFRESH_TOKEN_EXPIRE_MINUTES" to "1440",
                    "AUTH_POLICY_REFRESH_COOKIE_NAME" to "policy_refresh",
                    "AUTH_POLICY_REFRESH_COOKIE_SECURE" to "true",
                    "AUTH_POLICY_REFRESH_COOKIE_SAMESITE" to "strict",
                    "AUTH_POLICY_ALLOWED_ORIGINS" to "http://localhost:18080, https://gcs.example.test ",
                    "AUTH_POLICY_OPERATOR_USERNAME" to "op",
                    "AUTH_POLICY_OPERATOR_PASSWORD" to "op-password",
                    "AUTH_POLICY_OPERATOR_GROUP_ID" to "bn-1",
                    "AUTH_POLICY_SMOKE_USERNAME" to "viewer",
                    "AUTH_POLICY_SMOKE_PASSWORD" to "viewer-password",
                    "AUTH_POLICY_SMOKE_GROUP_ID" to "co-a",
                ),
            ),
        )

        val settings = AuthRuntimeSettings.fromEnvironment(env)

        assertEquals("policy-secret-at-least-32-characters", settings.jwtSecret)
        assertEquals("policy-issuer", settings.jwtIssuer)
        assertEquals(15, settings.accessTokenExpireMinutes)
        assertEquals(1440, settings.refreshTokenExpireMinutes)
        assertEquals("policy_refresh", settings.refreshCookieName)
        assertTrue(settings.refreshCookieSecure)
        assertEquals("strict", settings.refreshCookieSameSite)
        assertEquals(setOf("http://localhost:18080", "https://gcs.example.test"), settings.allowedOrigins)
        assertEquals("op", settings.operatorUsername)
        assertEquals("viewer", settings.smokeUsername)
        assertTrue(settings.redisPrincipalCacheEnabled)
    }

    @Test
    fun `runtime settings fall back to backend auth env for migration compatibility`() {
        val env = StandardEnvironment()
        env.propertySources.addFirst(
            MapPropertySource(
                "test",
                mapOf(
                    "AUTH_JWT_SECRET" to "backend-secret-at-least-32-characters",
                    "AUTH_JWT_ISSUER" to "backend-issuer",
                    "AUTH_REFRESH_COOKIE_NAME" to "backend_refresh",
                    "AUTH_REFRESH_COOKIE_SAMESITE" to "lax",
                    "BACKEND_CORS_ALLOW_ORIGINS" to "http://localhost:5173",
                ),
            ),
        )

        val settings = AuthRuntimeSettings.fromEnvironment(env)

        assertEquals("backend-secret-at-least-32-characters", settings.jwtSecret)
        assertEquals("backend-issuer", settings.jwtIssuer)
        assertEquals("backend_refresh", settings.refreshCookieName)
        assertFalse(settings.refreshCookieSecure)
        assertEquals(setOf("http://localhost:5173"), settings.allowedOrigins)
    }

    @Test
    fun `configuration wires repository and session service`() {
        val config = AuthPolicyConfig()
        val settings = AuthRuntimeSettings.fromEnvironment(StandardEnvironment())
        val passwordHasher = config.passwordHasher()
        val repository = config.authUserRepository(settings, passwordHasher)
        val tokenService = config.jwtTokenService(settings)
        val sessionService = config.authSessionService(
            repository,
            passwordHasher,
            tokenService,
            NoopPrincipalCache,
            StatelessRefreshSessionStore,
        )

        assertNotNull(repository.findByUsername("operator01"))
        assertNotNull(repository.findByUsername("m7-smoke-viewer"))
        assertNotNull(sessionService.login("operator01", "correct-password"))
    }
}
