package kr.co.a4ai.gcssaker.authpolicy.domain

import com.auth0.jwt.JWT
import com.auth0.jwt.JWTVerifier
import com.auth0.jwt.algorithms.Algorithm
import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.util.Date

class JwtTokenService(
    secret: String,
    private val issuer: String,
    private val accessTokenTtl: Duration,
    private val clock: Clock = Clock.systemUTC(),
) {
    private val algorithm: Algorithm = Algorithm.HMAC256(secret)
    private val verifier: JWTVerifier = JWT.require(algorithm)
        .withIssuer(issuer)
        .withClaim("token_use", "access")
        .build()

    init {
        require(secret.length >= 32) { "JWT secret must be at least 32 characters" }
        require(issuer.isNotBlank()) { "issuer must not be blank" }
        require(!accessTokenTtl.isNegative && !accessTokenTtl.isZero) { "access token ttl must be positive" }
    }

    fun issueAccessToken(principal: AuthenticatedPrincipal): String {
        val now = Instant.now(clock)
        return JWT.create()
            .withIssuer(issuer)
            .withSubject(principal.username)
            .withClaim("role", principal.role.name.lowercase())
            .withClaim("group_id", principal.groupId.value)
            .withClaim("token_use", "access")
            .withIssuedAt(Date.from(now))
            .withExpiresAt(Date.from(now.plus(accessTokenTtl)))
            .sign(algorithm)
    }

    fun verifyAccessToken(token: String): AuthenticatedPrincipal {
        val decoded = verifier.verify(token)
        val role = decoded.getClaim("role").asString()?.uppercase()?.let(UserRole::valueOf)
            ?: UserRole.VIEWER
        val groupId = decoded.getClaim("group_id").asString()
            ?: throw IllegalArgumentException("group_id claim is required")
        return AuthenticatedPrincipal(
            username = decoded.subject,
            role = role,
            groupId = GroupId(groupId),
        )
    }
}
