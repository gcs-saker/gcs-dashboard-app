package kr.co.a4ai.gcssaker.authpolicy

import com.auth0.jwt.JWT
import com.auth0.jwt.JWTCreator
import com.auth0.jwt.algorithms.Algorithm
import com.auth0.jwt.exceptions.JWTVerificationException
import kr.co.a4ai.gcssaker.authpolicy.domain.*
import kr.co.a4ai.gcssaker.authpolicy.infrastructure.security.JwtTelemetryCursorCodec
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.ValueSource
import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.time.ZoneId
import java.time.ZoneOffset

class TelemetryCursorCodecTest {
    private val secret = "telemetry-page-test-secret-32-characters"
    private val issuer = "fixture"
    private val clock = CursorClock(Instant.parse("2026-10-15T00:00:00Z"))
    private val codec = JwtTelemetryCursorCodec(secret, issuer, clock)
    private val actor = AuthenticatedPrincipal("viewer", UserRole.VIEWER, GroupId("co-a"))

    @Test
    fun `same identity can repeat a cursor until its exact expiry boundary`() {
        val cursor = codec.encode(actor, "a".repeat(128))
        assertEquals("a".repeat(128), codec.decode(actor, cursor))
        assertEquals("a".repeat(128), codec.decode(actor, cursor))
        clock.now = clock.now.plusSeconds(599)
        assertEquals("a".repeat(128), codec.decode(actor, cursor))
        clock.now = clock.now.plusSeconds(1)
        assertEquals("telemetry_cursor_invalid", assertThrows<InvalidContractError> { codec.decode(actor, cursor) }.code)
    }

    @ParameterizedTest
    @ValueSource(strings = ["username", "group", "role", "version"])
    fun `cursor cannot be transferred across any authoritative identity dimension`(changed: String) {
        val cursor = codec.encode(actor, "position")
        val other = when (changed) {
            "username" -> actor.copy(username = "other")
            "group" -> actor.copy(groupId = GroupId("co-b"))
            "role" -> actor.copy(role = UserRole.GROUP_ADMIN)
            else -> actor.copy(securityVersion = 2)
        }
        assertEquals("telemetry_cursor_scope_mismatch", assertThrows<PermissionDeniedError> { codec.decode(other, cursor) }.code)
    }

    @Test
    fun `cursor and access tokens cannot be substituted for each other`() {
        val tokens = JwtTokenService(secret, issuer, Duration.ofMinutes(5))
        assertThrows<JWTVerificationException> { tokens.verifyAccessToken(codec.encode(actor, "position")) }
        assertThrows<InvalidContractError> { codec.decode(actor, tokens.issueAccessToken(actor)) }
    }

    @ParameterizedTest
    @ValueSource(strings = ["", " ", "not-a-jwt", "too-long", "signature"])
    fun `malformed oversized and modified signatures are rejected without echoing input`(kind: String) {
        val cursor = when (kind) {
            "too-long" -> "x".repeat(2049)
            "signature" -> codec.encode(actor, "position").substringBeforeLast('.') + ".AA"
            else -> kind
        }
        val error = assertThrows<InvalidContractError> { codec.decode(actor, cursor) }
        assertEquals("cursor is invalid or expired", error.message)
    }

    @ParameterizedTest
    @ValueSource(strings = ["null-expiry", "null-issued", "wrong-after", "wrong-scope", "purpose", "audience", "issuer", "long-ttl", "empty-after", "long-after"])
    fun `signed but incompatible contracts are rejected`(kind: String) {
        val cursor = signed { token ->
            when (kind) {
                "null-expiry" -> token.withNullClaim("exp")
                "null-issued" -> token.withNullClaim("iat")
                "wrong-after" -> token.withClaim("after_uuid", 12)
                "wrong-scope" -> token.withClaim("page_scope", 12)
                "purpose" -> token.withClaim("token_use", "access")
                "audience" -> token.withAudience("other")
                "issuer" -> token.withIssuer("other")
                "long-ttl" -> token.withExpiresAt(clock.now.plusSeconds(601))
                "empty-after" -> token.withClaim("after_uuid", " ")
                else -> token.withClaim("after_uuid", "x".repeat(129))
            }
        }
        assertThrows<InvalidContractError> { codec.decode(actor, cursor) }
    }

    @Test
    fun `invalid signing configuration and invalid encoded positions are rejected`() {
        assertThrows<IllegalArgumentException> { JwtTelemetryCursorCodec("x".repeat(31), issuer, clock) }
        assertThrows<IllegalArgumentException> { JwtTelemetryCursorCodec(secret, " ", clock) }
        assertThrows<InvalidContractError> { codec.encode(actor, "x".repeat(129)) }
    }

    private fun signed(modify: (JWTCreator.Builder) -> Unit): String {
        val scope = JWT.decode(codec.encode(actor, "position")).getClaim("page_scope").asString()
        val token = JWT.create().withIssuer(issuer).withAudience(TelemetryPageLimits.CURSOR_PURPOSE)
            .withClaim("token_use", TelemetryPageLimits.CURSOR_PURPOSE).withClaim("page_scope", scope)
            .withClaim("after_uuid", "position").withIssuedAt(clock.now).withExpiresAt(clock.now.plusSeconds(600))
        modify(token)
        return token.sign(Algorithm.HMAC256(secret))
    }

    private class CursorClock(var now: Instant) : Clock() {
        override fun getZone(): ZoneId = ZoneOffset.UTC
        override fun withZone(zone: ZoneId): Clock = fixed(now, zone)
        override fun instant(): Instant = now
    }
}
