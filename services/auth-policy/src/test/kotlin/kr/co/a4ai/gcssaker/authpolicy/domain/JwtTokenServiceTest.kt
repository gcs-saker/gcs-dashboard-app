package kr.co.a4ai.gcssaker.authpolicy.domain

import com.auth0.jwt.exceptions.TokenExpiredException
import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.time.ZoneOffset
import java.time.temporal.ChronoUnit
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

class JwtTokenServiceTest {
    private val fixedClock = Clock.fixed(Instant.now().truncatedTo(ChronoUnit.SECONDS).minusSeconds(60), ZoneOffset.UTC)
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

    @Test
    fun `expired access token is rejected`() {
        val expiredIssuer = JwtTokenService(
            secret = "test-secret-must-be-at-least-32-characters",
            issuer = "gcs-saker-test",
            accessTokenTtl = Duration.ofMinutes(1),
            clock = Clock.fixed(Instant.parse("2000-01-01T00:00:00Z"), ZoneOffset.UTC),
        )
        val principal = AuthenticatedPrincipal("operator", UserRole.OPERATOR, GroupId("co-a"))

        assertFailsWith<TokenExpiredException> {
            service.verifyAccessToken(expiredIssuer.issueAccessToken(principal))
        }
    }

    @Test
    fun `refresh rotation preserves the original absolute session deadline`() {
        val principal = AuthenticatedPrincipal("operator", UserRole.OPERATOR, GroupId("co-a"))
        val initial = service.issueRefreshToken(principal)
        val initialSession = service.verifyRefreshTokenWithTtl(initial)

        val rotated = service.issueRefreshToken(principal, initialSession.sessionExpiresAt)
        val rotatedSession = service.verifyRefreshTokenWithTtl(rotated)

        assertEquals(initialSession.sessionExpiresAt, rotatedSession.sessionExpiresAt)
    }

    @Test
    fun `refresh expiry is capped by the absolute session deadline`() {
        val principal = AuthenticatedPrincipal("operator", UserRole.OPERATOR, GroupId("co-a"))
        val deadline = fixedClock.instant().plus(Duration.ofMinutes(15))

        val token = service.issueRefreshToken(principal, deadline)
        val verified = service.verifyRefreshTokenWithTtl(token)

        assertEquals(Duration.ofMinutes(15), verified.remainingTtl)
    }
}
