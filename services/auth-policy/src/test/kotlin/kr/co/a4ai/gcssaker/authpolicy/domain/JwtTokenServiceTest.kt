package kr.co.a4ai.gcssaker.authpolicy.domain

import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.time.ZoneOffset
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

class JwtTokenServiceTest {
    private val fixedClock = Clock.fixed(Instant.now().minusSeconds(60), ZoneOffset.UTC)
    private val service = JwtTokenService(
        secret = "test-secret-must-be-at-least-32-characters",
        issuer = "gcs-saker-test",
        accessTokenTtl = Duration.ofMinutes(30),
        clock = fixedClock,
    )

    @Test
    fun `issued access token preserves principal claims`() {
        val principal = AuthenticatedPrincipal("operator", UserRole.OPERATOR, GroupId("co-a"))

        val token = service.issueAccessToken(principal)
        val decoded = service.verifyAccessToken(token)

        assertEquals(principal, decoded)
    }

    @Test
    fun `short jwt secret is rejected`() {
        assertFailsWith<IllegalArgumentException> {
            JwtTokenService(
                secret = "too-short",
                issuer = "gcs-saker-test",
                accessTokenTtl = Duration.ofMinutes(30),
            )
        }
    }
}
