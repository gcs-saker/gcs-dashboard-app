package kr.co.a4ai.gcssaker.authpolicy.domain

data class AuthUser(
    val username: String,
    val email: String,
    val passwordHash: String,
    val role: UserRole,
    val groupId: GroupId,
) {
    init {
        require(username.isNotBlank()) { "username must not be blank" }
        require(email.isNotBlank()) { "email must not be blank" }
        require(passwordHash.isNotBlank()) { "password hash must not be blank" }
    }

    fun principal(): AuthenticatedPrincipal =
        AuthenticatedPrincipal(username = username, role = role, groupId = groupId)
}

interface AuthUserRepository {
    fun findByUsername(username: String): AuthUser?
}

class InMemoryAuthUserRepository(users: Collection<AuthUser>) : AuthUserRepository {
    private val usersByUsername = users.associateBy { it.username }

    override fun findByUsername(username: String): AuthUser? = usersByUsername[username]
}

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
) {
    fun login(username: String, password: String): IssuedTokenSet? {
        val user = users.findByUsername(username) ?: return null
        if (!passwordHasher.verify(password, user.passwordHash)) {
            return null
        }
        return issueTokens(user.principal())
    }

    fun refresh(refreshToken: String): IssuedTokenSet? {
        val principal = tokenService.verifyRefreshToken(refreshToken)
        val user = users.findByUsername(principal.username) ?: return null
        return issueTokens(user.principal())
    }

    fun verifyAccessToken(accessToken: String): AuthenticatedPrincipal =
        tokenService.verifyAccessToken(accessToken)

    private fun issueTokens(principal: AuthenticatedPrincipal): IssuedTokenSet =
        IssuedTokenSet(
            accessToken = tokenService.issueAccessToken(principal),
            refreshToken = tokenService.issueRefreshToken(principal),
            expiresInMinutes = tokenService.accessTokenExpiresInMinutes(),
            principal = principal,
        )
}
