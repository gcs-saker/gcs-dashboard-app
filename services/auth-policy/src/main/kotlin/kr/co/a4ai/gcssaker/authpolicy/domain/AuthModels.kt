package kr.co.a4ai.gcssaker.authpolicy.domain

import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicInteger

data class AuthUser(
    val id: Int = 0,
    val username: String,
    val email: String,
    val passwordHash: String,
    val companyId: Int = 1,
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
    fun findByEmail(email: String): AuthUser?
    fun save(user: AuthUser): AuthUser
}

class InMemoryAuthUserRepository(users: Collection<AuthUser>) : AuthUserRepository {
    private val usersByUsername = ConcurrentHashMap(users.associateBy { it.username })
    private val usersByEmail = ConcurrentHashMap(users.associateBy { it.email.lowercase() })
    private val nextId = AtomicInteger((users.maxOfOrNull { it.id } ?: 0) + 1)

    override fun findByUsername(username: String): AuthUser? = usersByUsername[username]

    override fun findByEmail(email: String): AuthUser? = usersByEmail[email.lowercase()]

    @Synchronized
    override fun save(user: AuthUser): AuthUser {
        require(usersByUsername[user.username] == null) { "Username already registered" }
        require(usersByEmail[user.email.lowercase()] == null) { "Email already registered" }
        val saved = if (user.id > 0) user else user.copy(id = nextId.getAndIncrement())
        usersByUsername[saved.username] = saved
        usersByEmail[saved.email.lowercase()] = saved
        return saved
    }
}

data class SignupInvite(
    val code: String,
    val companyId: Int,
    val groupId: GroupId,
) {
    init {
        require(code.isNotBlank()) { "invite code must not be blank" }
        require(companyId > 0) { "company id must be positive" }
    }
}

data class SignupCommand(
    val username: String,
    val email: String,
    val password: String,
    val inviteCode: String,
    val role: String,
)

class SignupRejectedException(message: String) : RuntimeException(message)

class AuthRegistrationService(
    private val users: AuthUserRepository,
    private val passwordHasher: PasswordHasher,
    invites: Collection<SignupInvite>,
) {
    private val invitesByCode = invites.associateBy { it.code }

    fun signup(command: SignupCommand): AuthUser {
        if (users.findByUsername(command.username) != null) {
            throw SignupRejectedException("Username already registered")
        }
        if (users.findByEmail(command.email) != null) {
            throw SignupRejectedException("Email already registered")
        }
        val invite = invitesByCode[command.inviteCode]
            ?: throw SignupRejectedException("Invalid invite code Input")
        val role = command.role.trim().uppercase().let {
            runCatching { UserRole.valueOf(it) }.getOrDefault(UserRole.VIEWER)
        }
        return users.save(
            AuthUser(
                username = command.username,
                email = command.email,
                passwordHash = passwordHasher.hash(command.password),
                companyId = invite.companyId,
                role = role,
                groupId = invite.groupId,
            ),
        )
    }
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
