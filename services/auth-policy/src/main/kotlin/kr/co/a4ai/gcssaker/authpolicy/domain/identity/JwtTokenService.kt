package kr.co.a4ai.gcssaker.authpolicy.domain

import com.auth0.jwt.JWT
import com.auth0.jwt.JWTVerifier
import com.auth0.jwt.algorithms.Algorithm
import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.util.Date
import java.util.UUID

class JwtTokenService(
    secret: String,
    private val issuer: String,
    private val accessTokenTtl: Duration,
    private val refreshTokenTtl: Duration = Duration.ofDays(7),
    private val clock: Clock = Clock.systemUTC(),
    private val absoluteSessionTtl: Duration = refreshTokenTtl.multipliedBy(4),
) {
    data class VerifiedAccessToken(
        val principal: AuthenticatedPrincipal,
        val remainingTtl: Duration,
    )
    data class VerifiedRefreshToken(
        val principal: AuthenticatedPrincipal,
        val sessionExpiresAt: Instant,
        val remainingTtl: Duration,
    )
    private val algorithm: Algorithm = Algorithm.HMAC256(secret)
    private val accessVerifier: JWTVerifier = JWT.require(algorithm)
        .withIssuer(issuer)
        .withClaim("token_use", "access")
        .build()
    private val refreshVerifier: JWTVerifier = JWT.require(algorithm)
        .withIssuer(issuer)
        .withClaim("token_use", "refresh")
        .build()

    init {
        require(secret.length >= 32) { "JWT secret must be at least 32 characters" }
        require(issuer.isNotBlank()) { "issuer must not be blank" }
        require(!accessTokenTtl.isNegative && !accessTokenTtl.isZero) { "access token ttl must be positive" }
        require(!refreshTokenTtl.isNegative && !refreshTokenTtl.isZero) { "refresh token ttl must be positive" }
        require(!absoluteSessionTtl.isNegative && !absoluteSessionTtl.isZero) { "absolute session ttl must be positive" }
        require(absoluteSessionTtl >= refreshTokenTtl) { "absolute session ttl must not be shorter than refresh token ttl" }
    }

    fun issueAccessToken(principal: AuthenticatedPrincipal): String {
        return issueToken(principal, "access", accessTokenTtl)
    }

    fun issueRefreshToken(principal: AuthenticatedPrincipal, sessionExpiresAt: Instant? = null): String {
        val now = clock.instant()
        val deadline = sessionExpiresAt ?: now.plus(absoluteSessionTtl)
        require(deadline.isAfter(now)) { "session is expired" }
        return issueToken(principal, "refresh", minOf(now.plus(refreshTokenTtl), deadline), deadline)
    }

    fun verifyAccessToken(token: String): AuthenticatedPrincipal {
        return verifyAccessTokenWithTtl(token).principal
    }

    fun verifyAccessTokenWithTtl(token: String): VerifiedAccessToken {
        val decoded = accessVerifier.verify(token)
        val expiresAt = decoded.expiresAtAsInstant
            ?: throw IllegalArgumentException("exp claim is required")
        val remainingTtl = Duration.between(clock.instant(), expiresAt)
        require(!remainingTtl.isZero && !remainingTtl.isNegative) { "access token is expired" }
        return VerifiedAccessToken(principalFromVerifiedToken(decoded), remainingTtl)
    }

    fun verifyRefreshToken(token: String): AuthenticatedPrincipal {
        return verifyRefreshTokenWithTtl(token).principal
    }

    fun verifyRefreshTokenWithTtl(token: String): VerifiedRefreshToken {
        val decoded = refreshVerifier.verify(token)
        val expiresAt = decoded.expiresAtAsInstant ?: throw IllegalArgumentException("exp claim is required")
        // Tokens issued before the absolute-session policy are bounded by their
        // existing expiry on first rotation instead of being invalidated at deploy.
        val sessionExpiresAt = decoded.getClaim("session_expires_at").asLong()?.let(Instant::ofEpochSecond)
            ?: expiresAt
        val now = clock.instant()
        require(sessionExpiresAt.isAfter(now)) { "session is expired" }
        val remainingTtl = Duration.between(now, minOf(expiresAt, sessionExpiresAt))
        require(!remainingTtl.isZero && !remainingTtl.isNegative) { "refresh token is expired" }
        return VerifiedRefreshToken(principalFromVerifiedToken(decoded), sessionExpiresAt, remainingTtl)
    }

    fun accessTokenExpiresInMinutes(): Long = accessTokenTtl.toMinutes()

    fun refreshTokenExpiresInMinutes(): Long = refreshTokenTtl.toMinutes()

    private fun issueToken(
        principal: AuthenticatedPrincipal,
        tokenUse: String,
        ttl: Duration,
    ): String {
        val now = Instant.now(clock)
        return issueToken(principal, tokenUse, now.plus(ttl), null)
    }

    private fun issueToken(
        principal: AuthenticatedPrincipal,
        tokenUse: String,
        expiresAt: Instant,
        sessionExpiresAt: Instant?,
    ): String {
        val now = Instant.now(clock)
        return JWT.create()
            .withIssuer(issuer)
            .withSubject(principal.username)
            .withClaim("role", principal.role.name.lowercase())
            .withClaim("group_id", principal.groupId.value)
            .withClaim("security_version", principal.securityVersion)
            .withClaim("token_use", tokenUse)
            .apply { sessionExpiresAt?.let { withClaim("session_expires_at", it.epochSecond) } }
            .withJWTId(UUID.randomUUID().toString())
            .withIssuedAt(Date.from(now))
            .withExpiresAt(Date.from(expiresAt))
            .sign(algorithm)
    }

    private fun principalFromVerifiedToken(decoded: com.auth0.jwt.interfaces.DecodedJWT): AuthenticatedPrincipal {
        val role = decoded.getClaim("role").asString()?.uppercase()?.let(UserRole::valueOf)
            ?: UserRole.VIEWER
        val groupId = decoded.getClaim("group_id").asString()
            ?: throw IllegalArgumentException("group_id claim is required")
        return AuthenticatedPrincipal(
            username = decoded.subject,
            role = role,
            groupId = GroupId(groupId),
            securityVersion = decoded.getClaim("security_version").asLong() ?: 1,
        )
    }
}
