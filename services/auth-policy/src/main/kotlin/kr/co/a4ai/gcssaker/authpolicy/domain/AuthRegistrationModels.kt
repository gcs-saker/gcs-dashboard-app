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

fun interface SignupInviteResolver {
    fun findByCode(code: String): SignupInvite?
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
    val role: String,
)

class SignupRejectedException(message: String) : RuntimeException(message)

class AuthRegistrationService(
    private val users: AuthUserRepository,
    private val passwordHasher: PasswordHasher,
    private val invites: SignupInviteResolver,
) {
    fun signup(command: SignupCommand): AuthUser {
        if (users.findByUsername(command.username) != null) {
            throw SignupRejectedException("Username already registered")
        }
        if (users.findByEmail(command.email) != null) {
            throw SignupRejectedException("Email already registered")
        }
        val invite = invites.findByCode(command.inviteCode)
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
