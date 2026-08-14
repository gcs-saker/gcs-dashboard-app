package kr.co.a4ai.gcssaker.authpolicy.domain

import java.time.Duration

data class IssuedTokenSet(
    val accessToken: String,
    val refreshToken: String,
    val expiresInMinutes: Long,
    val principal: AuthenticatedPrincipal,
)

class AuthSessionService(
    private val users: AuthUserRepository,
    private val passwordHasher: PasswordHasher,
    private val tokenService: JwtTokenService,
    private val principalCache: PrincipalCache = NoopPrincipalCache,
    private val refreshSessions: RefreshSessionStore = StatelessRefreshSessionStore,
) {
    fun login(username: String, password: String): IssuedTokenSet? {
        val user = users.findByUsername(username) ?: return null
        if (!user.active) return null
        if (!passwordHasher.verify(password, user.passwordHash)) {
            return null
        }
        return issueTokens(user.principal())
    }

    fun refresh(refreshToken: String): IssuedTokenSet? {
        val principal = if (refreshSessions.authoritative) {
            refreshSessions.consumeRefreshSession(refreshToken) ?: return null
        } else {
            tokenService.verifyRefreshToken(refreshToken)
        }
        val user = users.findByUsername(principal.username) ?: return null
        if (!user.active || user.securityVersion != principal.securityVersion) return null
        return issueTokens(user.principal())
    }

    fun revokeRefreshToken(refreshToken: String) {
        refreshSessions.revokeRefreshSession(refreshToken)
    }

    fun verifyAccessToken(accessToken: String): AuthenticatedPrincipal {
        // Neither Redis nor the signed JWT is authoritative after a role, group, or
        // account-state mutation. Always compare the token security version with DB state.
        principalCache.getAccessPrincipal(accessToken)
        val verified = tokenService.verifyAccessTokenWithTtl(accessToken)
        val currentUser = users.findByUsername(verified.principal.username)
            ?: throw IllegalArgumentException("user is not active")
        require(currentUser.active && currentUser.securityVersion == verified.principal.securityVersion) {
            "access token security version is stale"
        }
        principalCache.putAccessPrincipal(
            accessToken = accessToken,
            principal = verified.principal,
            ttl = verified.remainingTtl,
        )
        return currentUser.principal()
    }

    private fun issueTokens(principal: AuthenticatedPrincipal): IssuedTokenSet {
        val accessToken = tokenService.issueAccessToken(principal)
        principalCache.putAccessPrincipal(
            accessToken = accessToken,
            principal = principal,
            ttl = Duration.ofMinutes(tokenService.accessTokenExpiresInMinutes()),
        )
        val refreshToken = tokenService.issueRefreshToken(principal)
        refreshSessions.putRefreshSession(
            refreshToken = refreshToken,
            principal = principal,
            ttl = Duration.ofMinutes(tokenService.refreshTokenExpiresInMinutes()),
        )
        return IssuedTokenSet(
            accessToken = accessToken,
            refreshToken = refreshToken,
            expiresInMinutes = tokenService.accessTokenExpiresInMinutes(),
            principal = principal,
        )
    }
}
