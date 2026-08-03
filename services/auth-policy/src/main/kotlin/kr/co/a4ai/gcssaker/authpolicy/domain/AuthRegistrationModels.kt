package kr.co.a4ai.gcssaker.authpolicy.domain

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

interface SignupInviteResolver {
    fun findByCode(code: String): SignupInvite?

    fun <T> useInvite(code: String, action: (SignupInvite) -> T): T? =
        findByCode(code)?.let(action)
}

class SignupInvites private constructor(
    private val valuesByCode: Map<String, SignupInvite>,
) : SignupInviteResolver {
    override fun findByCode(code: String): SignupInvite? = valuesByCode[code]

    fun toList(): List<SignupInvite> = valuesByCode.values.toList()

    companion object {
        fun of(invites: Collection<SignupInvite>): SignupInvites {
            val values = invites.toList()
            require(values.map { it.code }.distinct().size == values.size) {
                "signup invite codes must be unique"
            }
            return SignupInvites(values.associateBy { it.code }.toMap())
        }
    }
}

data class SignupCommand(
    val username: String,
    val email: String,
    val password: String,
    val inviteCode: String,
)

class SignupRejectedException(message: String) : RuntimeException(message)
class DuplicateAuthUserException(message: String, cause: Throwable? = null) : IllegalArgumentException(message, cause)

class AuthRegistrationService(
    private val users: AuthUserRepository,
    private val passwordHasher: PasswordHasher,
    private val invites: SignupInviteResolver,
) {
    fun signup(command: SignupCommand): AuthUser {
        if (users.findByUsername(command.username) != null) {
            throw DuplicateAuthUserException("Username already registered")
        }
        if (users.findByEmail(command.email) != null) {
            throw DuplicateAuthUserException("Email already registered")
        }
        return invites.useInvite(command.inviteCode) { invite ->
            users.save(AuthUser(
                username = command.username,
                email = command.email,
                passwordHash = passwordHasher.hash(command.password),
                companyId = invite.companyId,
                role = UserRole.VIEWER,
                groupId = invite.groupId,
            ))
        } ?: throw SignupRejectedException("Invalid invite code Input")
    }
}
