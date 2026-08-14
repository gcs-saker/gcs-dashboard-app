package kr.co.a4ai.gcssaker.authpolicy.domain

data class AuthUser(
    val id: Int = 0,
    val username: String,
    val email: String,
    val passwordHash: String,
    val companyId: Int = 1,
    val role: UserRole,
    val groupId: GroupId,
    val active: Boolean = true,
    val securityVersion: Long = 1,
) {
    init {
        require(username.isNotBlank()) { "username must not be blank" }
        require(email.isNotBlank()) { "email must not be blank" }
        require(passwordHash.isNotBlank()) { "password hash must not be blank" }
        require(securityVersion > 0) { "security version must be positive" }
    }

    fun principal(): AuthenticatedPrincipal =
        AuthenticatedPrincipal(
            username = username,
            role = role,
            groupId = groupId,
            securityVersion = securityVersion,
        )
}

interface AuthUserRepository {
    fun findByUsername(username: String): AuthUser?
    fun findByEmail(email: String): AuthUser?
    fun save(user: AuthUser): AuthUser
    fun list(): List<AuthUser>
    fun update(user: AuthUser): AuthUser
    fun replaceGroupAdmin(groupId: GroupId, username: String): AuthUser
}
