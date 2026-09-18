package kr.co.a4ai.gcssaker.authpolicy.domain

import java.time.Duration

data class IssuedTokenSet(
    val accessToken: String,
    val refreshToken: String,
    val expiresInMinutes: Long,
    val refreshExpiresInSeconds: Long,
    val principal: AuthenticatedPrincipal,
)

class AuthSessionService(
    private val users: AuthUserRepository,
    private val passwordHasher: PasswordHasher,
    private val tokenService: JwtTokenService,
    private val principalCache: PrincipalCache = NoopPrincipalCache,
    private val refreshSessions: RefreshSessionStore = StatelessRefreshSessionStore,
    private val hierarchyRepository: OrganizationHierarchyRepository? = null,
    private val adminMfa: AdminMfaVerifier = MfaDisabled,
) {
    fun login(username: String, password: String, mfaCode: String? = null): IssuedTokenSet? {
        val user = users.findByUsername(username) ?: return null
        if (!canAuthenticate(user)) return null
        if (!passwordHasher.verify(password, user.passwordHash)) {
            return null
        }
        val principal = user.principal()
        if (!adminMfa.verify(principal, mfaCode)) return null
        return issueTokens(principal)
    }

    fun refresh(refreshToken: String): IssuedTokenSet? {
        val verified = tokenService.verifyRefreshTokenWithTtl(refreshToken)
        val principal = authoritativePrincipal(refreshToken, verified.principal) ?: return null
        val user = users.findByUsername(principal.username) ?: return null
        if (!canAuthenticate(user) || user.securityVersion != principal.securityVersion) return null
        return issueTokens(user.principal(), verified.sessionExpiresAt)
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
        require(canAuthenticate(currentUser) && currentUser.securityVersion == verified.principal.securityVersion) {
            "access token security version is stale"
        }
        principalCache.putAccessPrincipal(
            accessToken = accessToken,
            principal = verified.principal,
            ttl = verified.remainingTtl,
        )
        return currentUser.principal()
    }

    private fun issueTokens(
        principal: AuthenticatedPrincipal,
        sessionExpiresAt: java.time.Instant? = null,
    ): IssuedTokenSet {
        val accessToken = tokenService.issueAccessToken(principal)
        principalCache.putAccessPrincipal(
            accessToken = accessToken,
            principal = principal,
            ttl = Duration.ofMinutes(tokenService.accessTokenExpiresInMinutes()),
        )
        val refreshToken = tokenService.issueRefreshToken(principal, sessionExpiresAt)
        val refreshTtl = tokenService.verifyRefreshTokenWithTtl(refreshToken).remainingTtl
        refreshSessions.putRefreshSession(
            refreshToken = refreshToken,
            principal = principal,
            ttl = refreshTtl,
        )
        return IssuedTokenSet(
            accessToken = accessToken,
            refreshToken = refreshToken,
            expiresInMinutes = tokenService.accessTokenExpiresInMinutes(),
            refreshExpiresInSeconds = refreshTtl.seconds,
            principal = principal,
        )
    }

    private fun authoritativePrincipal(
        refreshToken: String,
        signedPrincipal: AuthenticatedPrincipal,
    ): AuthenticatedPrincipal? {
        if (!refreshSessions.authoritative) return signedPrincipal
        val storedPrincipal = refreshSessions.consumeRefreshSession(refreshToken) ?: return null
        return storedPrincipal.takeIf { it == signedPrincipal }
    }

    private fun isGroupActive(groupId: GroupId): Boolean =
        hierarchyRepository?.let { repository ->
            runCatching { repository.current().contains(groupId) }.getOrDefault(false)
        } ?: true

    private fun canAuthenticate(user: AuthUser): Boolean =
        user.active && (user.role == UserRole.ADMIN || isGroupActive(user.groupId))
}
