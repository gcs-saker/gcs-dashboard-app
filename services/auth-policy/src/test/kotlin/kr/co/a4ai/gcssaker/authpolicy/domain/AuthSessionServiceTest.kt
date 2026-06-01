package kr.co.a4ai.gcssaker.authpolicy.domain

import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.time.ZoneOffset
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull

class AuthSessionServiceTest {
    private val passwordHasher = PasswordHasher()
    private val tokenService = JwtTokenService(
        secret = "test-secret-must-be-at-least-32-characters",
        issuer = "gcs-saker-test",
        accessTokenTtl = Duration.ofMinutes(30),
        refreshTokenTtl = Duration.ofDays(7),
        clock = Clock.fixed(Instant.now().minusSeconds(30), ZoneOffset.UTC),
    )
    private val users = InMemoryAuthUserRepository(
        listOf(
            AuthUser(
                username = "operator01",
                email = "operator01@example.test",
                passwordHash = passwordHasher.hash("correct-password"),
                role = UserRole.OPERATOR,
                groupId = GroupId("co-a"),
            ),
        ),
    )
    private val principalCache = RecordingPrincipalCache()
    private val refreshSessions = RecordingRefreshSessionStore()
    private val service = AuthSessionService(users, passwordHasher, tokenService, principalCache, refreshSessions)

    @Test
    fun `login issues access and refresh token with principal claims`() {
        val tokens = service.login("operator01", "correct-password")

        assertNotNull(tokens)
        assertEquals("operator01", tokens.principal.username)
        assertEquals(UserRole.OPERATOR, tokens.principal.role)
        assertEquals(30, tokens.expiresInMinutes)
        assertNotEquals(tokens.accessToken, tokens.refreshToken)
        assertEquals(tokens.principal, tokenService.verifyAccessToken(tokens.accessToken))
        assertEquals(tokens.principal, tokenService.verifyRefreshToken(tokens.refreshToken))
        assertEquals(tokens.principal, principalCache.getAccessPrincipal(tokens.accessToken))
        assertEquals(tokens.principal, refreshSessions.peek(tokens.refreshToken))
    }

    @Test
    fun `login rejects unknown user or invalid password`() {
        assertNull(service.login("missing", "correct-password"))
        assertNull(service.login("operator01", "wrong-password"))
    }

    @Test
    fun `refresh rotates token pair for existing user`() {
        val loginTokens = requireNotNull(service.login("operator01", "correct-password"))

        val refreshed = service.refresh(loginTokens.refreshToken)

        assertNotNull(refreshed)
        assertEquals(loginTokens.principal, refreshed.principal)
        assertNotEquals(loginTokens.accessToken, refreshed.refreshToken)
        assertNull(refreshSessions.peek(loginTokens.refreshToken))
        assertEquals(refreshed.principal, refreshSessions.peek(refreshed.refreshToken))
    }

    @Test
    fun `refresh rejects reused refresh token when session store is authoritative`() {
        val loginTokens = requireNotNull(service.login("operator01", "correct-password"))

        assertNotNull(service.refresh(loginTokens.refreshToken))

        assertNull(service.refresh(loginTokens.refreshToken))
    }

    @Test
    fun `access token verification reuses cached principal`() {
        val tokens = requireNotNull(service.login("operator01", "correct-password"))
        principalCache.reads = 0

        val principal = service.verifyAccessToken(tokens.accessToken)

        assertEquals(tokens.principal, principal)
        assertEquals(1, principalCache.reads)
    }

    private class RecordingPrincipalCache : PrincipalCache {
        private val values = mutableMapOf<String, AuthenticatedPrincipal>()
        var reads = 0

        override fun getAccessPrincipal(accessToken: String): AuthenticatedPrincipal? {
            reads += 1
            return values[accessToken]
        }

        override fun putAccessPrincipal(
            accessToken: String,
            principal: AuthenticatedPrincipal,
            ttl: Duration,
        ) {
            values[accessToken] = principal
        }
    }

    private class RecordingRefreshSessionStore : RefreshSessionStore {
        private val values = mutableMapOf<String, AuthenticatedPrincipal>()
        override val authoritative = true

        override fun putRefreshSession(
            refreshToken: String,
            principal: AuthenticatedPrincipal,
            ttl: Duration,
        ) {
            values[refreshToken] = principal
        }

        override fun consumeRefreshSession(refreshToken: String): AuthenticatedPrincipal? =
            values.remove(refreshToken)

        override fun revokeRefreshSession(refreshToken: String) {
            values.remove(refreshToken)
        }

        fun peek(refreshToken: String): AuthenticatedPrincipal? = values[refreshToken]
    }
}
