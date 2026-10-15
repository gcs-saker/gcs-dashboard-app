package kr.co.a4ai.gcssaker.authpolicy.infrastructure.security

import com.auth0.jwt.JWT
import com.auth0.jwt.JWTVerifier
import com.auth0.jwt.algorithms.Algorithm
import com.auth0.jwt.exceptions.JWTVerificationException
import kr.co.a4ai.gcssaker.authpolicy.domain.*
import java.security.MessageDigest
import java.time.Clock
import java.time.Duration

class JwtTelemetryCursorCodec(
    secret: String,
    private val issuer: String,
    private val clock: Clock = Clock.systemUTC(),
) : TelemetryCursorCodec {
    private val algorithm = Algorithm.HMAC256(secret)
    private val verifier: JWTVerifier

    init {
        require(secret.length >= 32 && issuer.isNotBlank()) { "pagination signing configuration is invalid" }
        val verification = JWT.require(algorithm) as JWTVerifier.BaseVerification
        verification.withIssuer(issuer).withAudience(TelemetryPageLimits.CURSOR_PURPOSE)
            .withClaim(CursorClaims.USE, TelemetryPageLimits.CURSOR_PURPOSE)
            .withClaimPresence(CursorClaims.EXPIRY).withClaimPresence(CursorClaims.SCOPE).withClaimPresence(CursorClaims.AFTER)
        verifier = verification.build(clock)
    }

    override fun encode(principal: AuthenticatedPrincipal, afterUuid: String): String {
        TelemetryPageQuery(TelemetryPageSize(TelemetryPageLimits.DEFAULT_SIZE), afterUuid)
        val now = clock.instant()
        return JWT.create().withIssuer(issuer).withAudience(TelemetryPageLimits.CURSOR_PURPOSE)
            .withClaim(CursorClaims.USE, TelemetryPageLimits.CURSOR_PURPOSE)
            .withClaim(CursorClaims.SCOPE, scopeDigest(principal)).withClaim(CursorClaims.AFTER, afterUuid)
            .withIssuedAt(now).withExpiresAt(now.plusSeconds(TelemetryPageLimits.CURSOR_TTL_SECONDS)).sign(algorithm)
    }

    override fun decode(principal: AuthenticatedPrincipal, cursor: String): String {
        if (cursor.isBlank() || cursor.length > TelemetryPageLimits.MAX_CURSOR_LENGTH) invalid()
        val decoded = verifiedPosition(cursor)
        val scope = decoded.scope
        if (!MessageDigest.isEqual(scope.toByteArray(Charsets.UTF_8), scopeDigest(principal).toByteArray(Charsets.UTF_8))) {
            throw PermissionDeniedError("telemetry_cursor_scope_mismatch", "cursor does not belong to the current identity")
        }
        val after = decoded.after
        TelemetryPageQuery(TelemetryPageSize(TelemetryPageLimits.DEFAULT_SIZE), after)
        return after
    }

    private fun verifiedPosition(cursor: String): CursorPosition = try {
        val decoded = verifier.verify(cursor)
        val issued = decoded.issuedAtAsInstant ?: invalid()
        val expires = decoded.expiresAtAsInstant ?: invalid()
        if (!expires.isAfter(issued) || Duration.between(issued, expires).seconds > TelemetryPageLimits.CURSOR_TTL_SECONDS) invalid()
        CursorPosition(decoded.getClaim(CursorClaims.SCOPE).asString() ?: invalid(), decoded.getClaim(CursorClaims.AFTER).asString() ?: invalid())
    } catch (_: JWTVerificationException) {
        invalid()
    }

    private fun scopeDigest(principal: AuthenticatedPrincipal): String {
        val scope = listOf(principal.username, principal.groupId.value, principal.role.name, principal.securityVersion.toString())
            .joinToString("") { "${it.toByteArray(Charsets.UTF_8).size}:$it" }
        return MessageDigest.getInstance("SHA-256").digest(scope.toByteArray(Charsets.UTF_8)).joinToString("") { "%02x".format(it) }
    }

    private fun invalid(): Nothing = throw InvalidContractError("telemetry_cursor_invalid", "cursor is invalid or expired")

    private data class CursorPosition(val scope: String, val after: String)
}

private object CursorClaims {
    const val USE = "token_use"
    const val EXPIRY = "exp"
    const val SCOPE = "page_scope"
    const val AFTER = "after_uuid"
}
