package kr.co.a4ai.gcssaker.authpolicy

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import org.springframework.core.env.MapPropertySource
import org.springframework.core.env.StandardEnvironment
import org.springframework.beans.factory.ObjectProvider
import org.springframework.data.redis.core.StringRedisTemplate
import kr.co.a4ai.gcssaker.authpolicy.configuration.AllowedOrigins
import kr.co.a4ai.gcssaker.authpolicy.configuration.AuthPolicyConfig
import kr.co.a4ai.gcssaker.authpolicy.configuration.AuthRuntimeSettings
import kr.co.a4ai.gcssaker.authpolicy.configuration.OperationalPolicyConfig
import kr.co.a4ai.gcssaker.authpolicy.domain.AuthenticatedPrincipal
import kr.co.a4ai.gcssaker.authpolicy.domain.GroupId
import kr.co.a4ai.gcssaker.authpolicy.domain.NoopPrincipalCache
import kr.co.a4ai.gcssaker.authpolicy.domain.OperationalEventQuery
import kr.co.a4ai.gcssaker.authpolicy.domain.SignupInvite
import kr.co.a4ai.gcssaker.authpolicy.domain.SignupInvites
import kr.co.a4ai.gcssaker.authpolicy.domain.StatelessRefreshSessionStore
import kr.co.a4ai.gcssaker.authpolicy.domain.UserRole
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertFailsWith
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
                    "AUTH_POLICY_ADMIN_USERNAME" to "admin",
                    "AUTH_POLICY_ADMIN_PASSWORD" to "admin-password",
                    "AUTH_POLICY_ADMIN_GROUP_ID" to "bn-1",
                    "AUTH_POLICY_OPERATOR_USERNAME" to "op",
                    "AUTH_POLICY_OPERATOR_PASSWORD" to "op-password",
                    "AUTH_POLICY_OPERATOR_GROUP_ID" to "bn-1",
                    "AUTH_POLICY_SMOKE_USERNAME" to "viewer",
                    "AUTH_POLICY_SMOKE_PASSWORD" to "viewer-password",
                    "AUTH_POLICY_SMOKE_GROUP_ID" to "co-a",
                    "AUTH_POLICY_OPERATIONAL_EVENT_CACHE_KEY_PREFIX" to "test:ops-events:",
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
        assertEquals(setOf("http://localhost:18080", "https://gcs.example.test"), settings.allowedOrigins.toSet())
        assertEquals("admin", settings.adminUsername)
        assertEquals("op", settings.operatorUsername)
        assertEquals("viewer", settings.smokeUsername)
        assertTrue(settings.redisPrincipalCacheEnabled)
        assertEquals("test:ops-events:", settings.operationalEventCacheKeyPrefix)
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
                    "AUTH_POLICY_ADMIN_PASSWORD" to "admin-password",
                    "AUTH_POLICY_OPERATOR_PASSWORD" to "operator-password",
                    "AUTH_POLICY_SMOKE_PASSWORD" to "viewer-password",
                ),
            ),
        )

        val settings = AuthRuntimeSettings.fromEnvironment(env)

        assertEquals("backend-secret-at-least-32-characters", settings.jwtSecret)
        assertEquals("backend-issuer", settings.jwtIssuer)
        assertEquals("backend_refresh", settings.refreshCookieName)
        assertFalse(settings.refreshCookieSecure)
        assertEquals(setOf("http://localhost:5173"), settings.allowedOrigins.toSet())
    }

    @Test
    fun `production profile fails closed when required auth secrets are missing`() {
        val env = StandardEnvironment()
        env.setActiveProfiles("prod")

        val error = assertFailsWith<IllegalStateException> {
            AuthRuntimeSettings.fromEnvironment(env)
        }

        assertTrue(error.message.orEmpty().contains("AUTH_POLICY_JWT_SECRET"))
        assertFalse(error.message.orEmpty().contains("local-auth-policy-secret"))
    }

    @Test
    fun `production profile fails closed when admin password is missing`() {
        val error = assertFailsWith<IllegalStateException> {
            AuthRuntimeSettings.fromEnvironment(
                productionEnvironment(
                    "AUTH_POLICY_JWT_SECRET" to "prod-secret-at-least-32-characters",
                    "AUTH_POLICY_OPERATOR_PASSWORD" to "operator-password",
                    "AUTH_POLICY_SMOKE_PASSWORD" to "viewer-password",
                ),
            )
        }

        assertTrue(error.message.orEmpty().contains("AUTH_POLICY_ADMIN_PASSWORD"))
        assertFalse(error.message.orEmpty().contains("admin-password"))
    }

    @Test
    fun `production profile fails closed when operator password is missing`() {
        val error = assertFailsWith<IllegalStateException> {
            AuthRuntimeSettings.fromEnvironment(
                productionEnvironment(
                    "AUTH_POLICY_JWT_SECRET" to "prod-secret-at-least-32-characters",
                    "AUTH_POLICY_ADMIN_PASSWORD" to "admin-password",
                    "AUTH_POLICY_SMOKE_PASSWORD" to "viewer-password",
                ),
            )
        }

        assertTrue(error.message.orEmpty().contains("AUTH_POLICY_OPERATOR_PASSWORD"))
        assertFalse(error.message.orEmpty().contains("correct-password"))
    }

    @Test
    fun `production profile fails closed when smoke password is missing`() {
        val error = assertFailsWith<IllegalStateException> {
            AuthRuntimeSettings.fromEnvironment(
                productionEnvironment(
                    "AUTH_POLICY_JWT_SECRET" to "prod-secret-at-least-32-characters",
                    "AUTH_POLICY_ADMIN_PASSWORD" to "admin-password",
                    "AUTH_POLICY_OPERATOR_PASSWORD" to "operator-password",
                ),
            )
        }

        assertTrue(error.message.orEmpty().contains("AUTH_POLICY_SMOKE_PASSWORD"))
        assertFalse(error.message.orEmpty().contains("m7-smoke-pass"))
    }

    @Test
    fun `local defaults are rejected without explicit local test or dev profile`() {
        val env = StandardEnvironment()
        env.propertySources.addFirst(
            MapPropertySource(
                "test",
                mapOf("AUTH_POLICY_ALLOW_LOCAL_DEFAULTS" to "true"),
            ),
        )

        val error = assertFailsWith<IllegalStateException> {
            AuthRuntimeSettings.fromEnvironment(env)
        }

        assertTrue(error.message.orEmpty().contains("AUTH_POLICY_JWT_SECRET"))
    }

    @Test
    fun `local profile can use development auth defaults explicitly`() {
        val settings = AuthRuntimeSettings.fromEnvironment(localEnvironment())

        assertEquals("local-auth-policy-secret-at-least-32-characters", settings.jwtSecret)
        assertEquals("admin-password", settings.adminPassword)
        assertEquals("correct-password", settings.operatorPassword)
        assertEquals("m7-smoke-pass", settings.smokePassword)
    }

    @Test
    fun `configuration wires repository and session service`() {
        val config = AuthPolicyConfig()
        val settings = AuthRuntimeSettings.fromEnvironment(localEnvironment())
        val passwordHasher = config.passwordHasher()
        val repository = config.authUserRepository(settings, passwordHasher, EmptyObjectProvider())
        val tokenService = config.jwtTokenService(settings)
        val sessionService = config.authSessionService(
            repository,
            passwordHasher,
            tokenService,
            NoopPrincipalCache,
            StatelessRefreshSessionStore,
        )

        assertNotNull(repository.findByUsername("admin01"))
        assertNotNull(repository.findByUsername("operator01"))
        assertNotNull(repository.findByUsername("m7-smoke-viewer"))
        assertNotNull(sessionService.login("admin01", "admin-password"))
        assertNotNull(sessionService.login("operator01", "correct-password"))
    }

    @Test
    fun `configuration seeds operational event repository for dashboard log integration`() {
        val repository = OperationalPolicyConfig().operationalEventRepository(
            AuthRuntimeSettings.fromEnvironment(localEnvironment()),
            EmptyObjectProvider(),
            EmptyObjectProvider<StringRedisTemplate>(),
            jacksonObjectMapper().findAndRegisterModules(),
        )
        val principal = AuthenticatedPrincipal("operator01", UserRole.OPERATOR, GroupId("co-a"))

        val allEvents = repository.eventsFor(principal, OperationalEventQuery())
        val warnEvents = repository.eventsFor(principal, OperationalEventQuery(severity = "warn", query = "ICE"))

        assertEquals(5, allEvents.size)
        assertEquals("ops-security-001", allEvents.first().id)
        assertEquals(1, warnEvents.size)
        assertEquals("TURN 릴레이", warnEvents.first().source)
    }

    @Test
    fun `configuration reads closed network time sync defaults`() {
        val env = StandardEnvironment()
        env.propertySources.addFirst(
            MapPropertySource(
                "test",
                mapOf(
                    "TIME_SYNC_MODE" to "closed_network",
                    "TIME_SYNC_SOURCE_HOST" to "10.0.0.10",
                    "TIME_SYNC_SOURCE_PORT" to "123",
                    "TIME_SYNC_DRIFT_WARN_MS" to "500",
                ),
            ),
        )

        val config = AuthPolicyConfig().timeSyncConfigRepository(env).current()

        assertEquals("10.0.0.10", config.sourceHost)
        assertEquals(123, config.sourcePort)
        assertEquals(500, config.driftWarnMs)
    }

    @Test
    fun `first class collections protect auth policy runtime contracts`() {
        val origins = AllowedOrigins.of(listOf(" http://localhost:5173 ", "", "https://gcs.example.test"))
        val invites = SignupInvites.of(listOf(SignupInvite("A4AI01", 1, GroupId("co-a"))))

        assertTrue("http://localhost:5173" in origins)
        assertEquals(setOf("http://localhost:5173", "https://gcs.example.test"), origins.toSet())
        assertEquals("co-a", invites.findByCode("A4AI01")?.groupId?.value)
        assertFailsWith<IllegalArgumentException> {
            SignupInvites.of(
                listOf(
                    SignupInvite("A4AI01", 1, GroupId("co-a")),
                    SignupInvite("A4AI01", 1, GroupId("co-b")),
                ),
            )
        }
    }
}

private fun localEnvironment(): StandardEnvironment =
    StandardEnvironment().apply {
        setActiveProfiles("local")
    }

private fun productionEnvironment(vararg values: Pair<String, String>): StandardEnvironment =
    StandardEnvironment().apply {
        setActiveProfiles("prod")
        propertySources.addFirst(MapPropertySource("test", mapOf(*values)))
    }

private class EmptyObjectProvider<T> : ObjectProvider<T> {
    override fun getIfAvailable(): T? = null
}
